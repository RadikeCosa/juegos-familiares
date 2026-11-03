-- Cadáver exquisito: private story content, shared room identity, authoritative turns.
set local lock_timeout = '5s';
create schema cadaver_private;
revoke all on schema cadaver_private from public, anon, authenticated;

alter table public.rooms drop constraint rooms_game_type_check;
alter table public.rooms add constraint rooms_game_type_check check(game_type in ('impostor','tutti_frutti','dictionary','cadaver_exquisito'));
alter table public.room_sessions drop constraint room_sessions_game_type_check;
alter table public.room_sessions add constraint room_sessions_game_type_check check(game_type in ('impostor','tutti_frutti','dictionary','cadaver_exquisito'));
alter table public.room_sessions drop constraint room_sessions_impostor_link_check;
alter table public.room_sessions add constraint room_sessions_impostor_link_check check(
 (game_type='impostor' and impostor_game_session_id is not null and impostor_game_session_id=id) or
 (game_type in ('tutti_frutti','dictionary','cadaver_exquisito') and impostor_game_session_id is null));

-- Existing games require a member host. Cadáver may retain an inactive historical
-- host reference when its last lobby occupant leaves; authority still requires a slot.
alter table public.rooms add column member_host_player_id uuid generated always as
 (case when game_type='cadaver_exquisito' then null else host_player_id end) stored;
alter table public.rooms drop constraint rooms_host_participant_fkey;
alter table public.rooms add constraint rooms_host_participant_fkey foreign key(id,member_host_player_id)
 references public.room_participants(room_id,player_id) deferrable initially deferred;

create table cadaver_private.rooms (
 room_id uuid primary key references public.rooms(id), round_count integer not null default 3 check(round_count in (3,5,7)),
 last_activity_at timestamptz not null default clock_timestamp(), closed_reason text check(closed_reason in ('completed','cancelled','expired')),
 lobby_version bigint not null default 0
);
create table cadaver_private.sessions (
 id uuid primary key references public.room_sessions(id), round_count integer not null check(round_count in (3,5,7)),
 status text not null default 'writing' check(status in ('writing','completed','cancelled','expired')),
 next_turn integer not null default 1 check(next_turn>0)
);
create table cadaver_private.authors (
 session_id uuid not null references cadaver_private.sessions(id), player_id uuid not null references public.players(id),
 position integer not null check(position>0), nickname text not null,
 primary key(session_id,player_id), unique(session_id,position)
);
create table cadaver_private.contributions (
 session_id uuid not null references cadaver_private.sessions(id), turn_number integer not null check(turn_number>0),
 operation_id uuid not null, player_id uuid not null, body text not null,
 primary key(session_id,turn_number), unique(session_id,operation_id),
 foreign key(session_id,player_id) references cadaver_private.authors(session_id,player_id)
);
-- The only replicated rows: routing identity and a transactional, content-free counter.
create table public.cadaver_signals(room_id uuid primary key references public.rooms(id), version bigint not null default 0);
alter table public.cadaver_signals enable row level security;
revoke all on public.cadaver_signals from public,anon,authenticated;
grant select on public.cadaver_signals to authenticated;
create function cadaver_private.can_receive(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_active_room_slots s join public.players p on p.id=s.player_id and p.group_id=s.group_id
 join public.rooms r on r.id=s.room_id where s.room_id=rid and p.auth_user_id=auth.uid() and r.game_type='cadaver_exquisito');
$$;
grant usage on schema cadaver_private to authenticated;
create policy cadaver_signal_occupant on public.cadaver_signals for select to authenticated using(cadaver_private.can_receive(room_id));
alter publication supabase_realtime add table public.cadaver_signals;
create function cadaver_private.signal(rid uuid) returns void language sql security definer set search_path='' as $$
 insert into public.cadaver_signals(room_id) values(rid) on conflict(room_id) do update set version=public.cadaver_signals.version+1;
$$;
create function cadaver_private.initialize() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.game_type='cadaver_exquisito' then insert into cadaver_private.rooms(room_id) values(new.id); perform cadaver_private.signal(new.id); end if;
 return new;
end $$;
create trigger cadaver_initialize after insert on public.rooms for each row execute function cadaver_private.initialize();

create function cadaver_private.actor() returns public.players language plpgsql security definer set search_path='' as $$
declare p public.players;
begin
 if auth.uid() is null then raise exception 'Identidad requerida.' using errcode='28000'; end if;
 select * into p from public.players where auth_user_id=auth.uid();
 if p.id is null then raise exception 'Entrá a tu grupo para jugar.' using errcode='C0001'; end if;
 return p;
end $$;
-- Every state-changing path locks Room before Session. Terminal paths never reopen.
create function cadaver_private.finish(rid uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform 1 from public.rooms where id=rid for update;
 if (select closed_reason from cadaver_private.rooms where room_id=rid) is not null then return; end if;
 select s.id into sid from cadaver_private.sessions s join public.room_sessions rs on rs.id=s.id where rs.room_id=rid for update of s;
 if reason<>'completed' then delete from cadaver_private.contributions where session_id=sid; end if;
 update cadaver_private.sessions set status=reason where id=sid;
 update public.room_sessions set finished_at=clock_timestamp() where id=sid and finished_at is null;
 update cadaver_private.rooms set closed_reason=reason where room_id=rid;
 perform cadaver_private.signal(rid);
 update public.rooms set status='closed' where id=rid;
 delete from public.player_active_room_slots where room_id=rid;
end $$;
create function cadaver_private.expire(rid uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.rooms where id=rid and game_type='cadaver_exquisito' for update;
 if not found then return false; end if;
 if (select closed_reason from cadaver_private.rooms where room_id=rid) is not null then return true; end if;
 if (select last_activity_at+interval '24 hours'<=clock_timestamp() from cadaver_private.rooms where room_id=rid) then
  perform cadaver_private.finish(rid,'expired'); return true;
 end if;
 return false;
end $$;
-- Occupancy, not frozen authorship, determines whether a host can act.
create function cadaver_private.succeed(rid uuid) returns void language plpgsql security definer set search_path='' as $$
declare candidate uuid; host uuid;
begin
 select host_player_id into host from public.rooms where id=rid for update;
 if exists(select 1 from public.room_participants rp join public.player_active_room_slots sl on sl.room_id=rp.room_id and sl.player_id=rp.player_id
 where rp.room_id=rid and rp.player_id=host and public.is_room_participant_liveness_active(rp.last_seen_at,clock_timestamp())) then return; end if;
 select rp.player_id into candidate from public.room_participants rp join public.player_active_room_slots sl on sl.room_id=rp.room_id and sl.player_id=rp.player_id
 where rp.room_id=rid and public.is_room_participant_liveness_active(rp.last_seen_at,clock_timestamp())
 order by rp.joined_at,rp.player_id limit 1;
 if candidate is not null and candidate is distinct from host then
  update public.rooms set host_player_id=candidate where id=rid;
  perform cadaver_private.signal(rid);
 end if;
end $$;

create function cadaver_private.words(raw text) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(token order by ord),'{}'::text[]) from unnest(string_to_array(btrim(regexp_replace(translate(normalize(coalesce(raw,''),NFC),U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF','                          '),' +',' ','g')),' ')) with ordinality t(token,ord)
 where exists(select 1 from generate_series(1,char_length(token)) i where ascii(substr(token,i,1)) <@ '{[48,58),[65,91),[97,123),[170,171),[178,180),[181,182),[185,187),[188,191),[192,215),[216,247),[248,706),[710,722),[736,741),[748,749),[750,751),[880,885),[886,888),[890,894),[895,896),[902,903),[904,907),[908,909),[910,930),[931,1014),[1015,1154),[1162,1328),[1329,1367),[1369,1370),[1376,1417),[1488,1515),[1519,1523),[1568,1611),[1632,1642),[1646,1648),[1649,1748),[1749,1750),[1765,1767),[1774,1789),[1791,1792),[1808,1809),[1810,1840),[1869,1958),[1969,1970),[1984,2027),[2036,2038),[2042,2043),[2048,2070),[2074,2075),[2084,2085),[2088,2089),[2112,2137),[2144,2155),[2160,2184),[2185,2192),[2208,2250),[2308,2362),[2365,2366),[2384,2385),[2392,2402),[2406,2416),[2417,2433),[2437,2445),[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2493,2494),[2510,2511),[2524,2526),[2527,2530),[2534,2546),[2548,2554),[2556,2557),[2565,2571),[2575,2577),[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2649,2653),[2654,2655),[2662,2672),[2674,2677),[2693,2702),[2703,2706),[2707,2729),[2730,2737),[2738,2740),[2741,2746),[2749,2750),[2768,2769),[2784,2786),[2790,2800),[2809,2810),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2877,2878),[2908,2910),[2911,2914),[2918,2928),[2929,2936),[2947,2948),[2949,2955),[2958,2961),[2962,2966),[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3024,3025),[3046,3059),[3077,3085),[3086,3089),[3090,3113),[3114,3130),[3133,3134),[3160,3163),[3164,3166),[3168,3170),[3174,3184),[3192,3199),[3200,3201),[3205,3213),[3214,3217),[3218,3241),[3242,3252),[3253,3258),[3261,3262),[3292,3295),[3296,3298),[3302,3312),[3313,3315),[3332,3341),[3342,3345),[3346,3387),[3389,3390),[3406,3407),[3412,3415),[3416,3426),[3430,3449),[3450,3456),[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),[3558,3568),[3585,3633),[3634,3636),[3648,3655),[3664,3674),[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),[3751,3761),[3762,3764),[3773,3774),[3776,3781),[3782,3783),[3792,3802),[3804,3808),[3840,3841),[3872,3892),[3904,3912),[3913,3949),[3976,3981),[4096,4139),[4159,4170),[4176,4182),[4186,4190),[4193,4194),[4197,4199),[4206,4209),[4213,4226),[4238,4239),[4240,4250),[4256,4294),[4295,4296),[4301,4302),[4304,4347),[4348,4681),[4682,4686),[4688,4695),[4696,4697),[4698,4702),[4704,4745),[4746,4750),[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),[4808,4823),[4824,4881),[4882,4886),[4888,4955),[4969,4989),[4992,5008),[5024,5110),[5112,5118),[5121,5741),[5743,5760),[5761,5787),[5792,5867),[5870,5881),[5888,5906),[5919,5938),[5952,5970),[5984,5997),[5998,6001),[6016,6068),[6103,6104),[6108,6109),[6112,6122),[6128,6138),[6160,6170),[6176,6265),[6272,6277),[6279,6313),[6314,6315),[6320,6390),[6400,6431),[6470,6510),[6512,6517),[6528,6572),[6576,6602),[6608,6619),[6656,6679),[6688,6741),[6784,6794),[6800,6810),[6823,6824),[6917,6964),[6981,6989),[6992,7002),[7043,7073),[7086,7142),[7168,7204),[7232,7242),[7245,7294),[7296,7307),[7312,7355),[7357,7360),[7401,7405),[7406,7412),[7413,7415),[7418,7419),[7424,7616),[7680,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),[8025,8026),[8027,8028),[8029,8030),[8031,8062),[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),[8144,8148),[8150,8156),[8160,8173),[8178,8181),[8182,8189),[8304,8306),[8308,8314),[8319,8330),[8336,8349),[8450,8451),[8455,8456),[8458,8468),[8469,8470),[8473,8478),[8484,8485),[8486,8487),[8488,8489),[8490,8494),[8495,8506),[8508,8512),[8517,8522),[8526,8527),[8528,8586),[9312,9372),[9450,9472),[10102,10132),[11264,11493),[11499,11503),[11506,11508),[11517,11518),[11520,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11632),[11648,11671),[11680,11687),[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),[11736,11743),[11823,11824),[12293,12296),[12321,12330),[12337,12342),[12344,12349),[12353,12439),[12445,12448),[12449,12539),[12540,12544),[12549,12592),[12593,12687),[12690,12694),[12704,12736),[12784,12800),[12832,12842),[12872,12880),[12881,12896),[12928,12938),[12977,12992),[13312,19904),[19968,42125),[42192,42238),[42240,42509),[42512,42540),[42560,42607),[42623,42654),[42656,42736),[42775,42784),[42786,42889),[42891,42973),[42993,43010),[43011,43014),[43015,43019),[43020,43043),[43056,43062),[43072,43124),[43138,43188),[43216,43226),[43250,43256),[43259,43260),[43261,43263),[43264,43302),[43312,43335),[43360,43389),[43396,43443),[43471,43482),[43488,43493),[43494,43519),[43520,43561),[43584,43587),[43588,43596),[43600,43610),[43616,43639),[43642,43643),[43646,43696),[43697,43698),[43701,43703),[43705,43710),[43712,43713),[43714,43715),[43739,43742),[43744,43755),[43762,43765),[43777,43783),[43785,43791),[43793,43799),[43808,43815),[43816,43823),[43824,43867),[43868,43882),[43888,44003),[44016,44026),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),[64256,64263),[64275,64280),[64285,64286),[64287,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),[64326,64434),[64467,64830),[64848,64912),[64914,64968),[65008,65020),[65136,65141),[65142,65277),[65296,65306),[65313,65339),[65345,65371),[65382,65471),[65474,65480),[65482,65488),[65490,65496),[65498,65501),[65536,65548),[65549,65575),[65576,65595),[65596,65598),[65599,65614),[65616,65630),[65664,65787),[65799,65844),[65856,65913),[65930,65932),[66176,66205),[66208,66257),[66273,66300),[66304,66340),[66349,66379),[66384,66422),[66432,66462),[66464,66500),[66504,66512),[66513,66518),[66560,66718),[66720,66730),[66736,66772),[66776,66812),[66816,66856),[66864,66916),[66928,66939),[66940,66955),[66956,66963),[66964,66966),[66967,66978),[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),[67424,67432),[67456,67462),[67463,67505),[67506,67515),[67584,67590),[67592,67593),[67594,67638),[67639,67641),[67644,67645),[67647,67670),[67672,67703),[67705,67743),[67751,67760),[67808,67827),[67828,67830),[67835,67868),[67872,67898),[67904,67930),[67968,68024),[68028,68048),[68050,68097),[68112,68116),[68117,68120),[68121,68150),[68160,68169),[68192,68223),[68224,68256),[68288,68296),[68297,68325),[68331,68336),[68352,68406),[68416,68438),[68440,68467),[68472,68498),[68521,68528),[68608,68681),[68736,68787),[68800,68851),[68858,68900),[68912,68922),[68928,68966),[68975,68998),[69216,69247),[69248,69290),[69296,69298),[69314,69320),[69376,69416),[69424,69446),[69457,69461),[69488,69506),[69552,69580),[69600,69623),[69635,69688),[69714,69744),[69745,69747),[69749,69750),[69763,69808),[69840,69865),[69872,69882),[69891,69927),[69942,69952),[69956,69957),[69959,69960),[69968,70003),[70006,70007),[70019,70067),[70081,70085),[70096,70107),[70108,70109),[70113,70133),[70144,70162),[70163,70188),[70207,70209),[70272,70279),[70280,70281),[70282,70286),[70287,70302),[70303,70313),[70320,70367),[70384,70394),[70405,70413),[70415,70417),[70419,70441),[70442,70449),[70450,70452),[70453,70458),[70461,70462),[70480,70481),[70493,70498),[70528,70538),[70539,70540),[70542,70543),[70544,70582),[70583,70584),[70609,70610),[70611,70612),[70656,70709),[70727,70731),[70736,70746),[70751,70754),[70784,70832),[70852,70854),[70855,70856),[70864,70874),[71040,71087),[71128,71132),[71168,71216),[71236,71237),[71248,71258),[71296,71339),[71352,71353),[71360,71370),[71376,71396),[71424,71451),[71472,71484),[71488,71495),[71680,71724),[71840,71923),[71935,71943),[71945,71946),[71948,71956),[71957,71959),[71960,71984),[71999,72000),[72001,72002),[72016,72026),[72096,72104),[72106,72145),[72161,72162),[72163,72164),[72192,72193),[72203,72243),[72250,72251),[72272,72273),[72284,72330),[72349,72350),[72368,72441),[72640,72673),[72688,72698),[72704,72713),[72714,72751),[72768,72769),[72784,72813),[72818,72848),[72960,72967),[72968,72970),[72971,73009),[73030,73031),[73040,73050),[73056,73062),[73063,73065),[73066,73098),[73112,73113),[73120,73130),[73136,73180),[73184,73194),[73440,73459),[73474,73475),[73476,73489),[73490,73524),[73552,73562),[73648,73649),[73664,73685),[73728,74650),[74752,74863),[74880,75076),[77712,77809),[77824,78896),[78913,78919),[78944,82939),[82944,83527),[90368,90398),[90416,90426),[92160,92729),[92736,92767),[92768,92778),[92784,92863),[92864,92874),[92880,92910),[92928,92976),[92992,92996),[93008,93018),[93019,93026),[93027,93048),[93053,93072),[93504,93549),[93552,93562),[93760,93847),[93856,93881),[93883,93908),[93952,94027),[94032,94033),[94099,94112),[94176,94178),[94179,94180),[94194,94199),[94208,101590),[101631,101663),[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),[110898,110899),[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),[113776,113789),[113792,113801),[113808,113818),[118000,118010),[119488,119508),[119520,119540),[119648,119673),[119808,119893),[119894,119965),[119966,119968),[119970,119971),[119973,119975),[119977,119981),[119982,119994),[119995,119996),[119997,120004),[120005,120070),[120071,120075),[120077,120085),[120086,120093),[120094,120122),[120123,120127),[120128,120133),[120134,120135),[120138,120145),[120146,120486),[120488,120513),[120514,120539),[120540,120571),[120572,120597),[120598,120629),[120630,120655),[120656,120687),[120688,120713),[120714,120745),[120746,120771),[120772,120780),[120782,120832),[122624,122655),[122661,122667),[122928,122990),[123136,123181),[123191,123198),[123200,123210),[123214,123215),[123536,123566),[123584,123628),[123632,123642),[124112,124140),[124144,124154),[124368,124398),[124400,124411),[124608,124639),[124640,124643),[124644,124646),[124647,124654),[124656,124661),[124670,124672),[124896,124903),[124904,124908),[124909,124911),[124912,124927),[124928,125125),[125127,125136),[125184,125252),[125259,125260),[125264,125274),[126065,126124),[126125,126128),[126129,126133),[126209,126254),[126255,126270),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),[126603,126620),[126625,126628),[126629,126634),[126635,126652),[127232,127245),[130032,130042),[131072,173792),[173824,178206),[178208,183982),[183984,191457),[191472,192094),[194560,195102),[196608,201547),[201552,210042)}'::int4multirange);
$$;
create function cadaver_private.normalize_body(raw text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(translate(normalize(coalesce(raw,''),NFC),U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF','                          '),' +',' ','g'));
$$;
-- State never discloses full contributions until completed. Former authors may recover metadata.
create function public.get_cadaver_state(target_room_id uuid default null, room_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.players; r public.rooms; cr cadaver_private.rooms; s cadaver_private.sessions;
 occupied boolean; roster jsonb; writer uuid; hint text[]; sid uuid; now_at timestamptz;
begin
 p:=cadaver_private.actor();
 select * into r from public.rooms where group_id=p.group_id and game_type='cadaver_exquisito'
 and ((target_room_id is not null and id=target_room_id) or (target_room_id is null and join_code=public.normalize_room_join_code(room_code))) for update;
 if r.id is null or not (exists(select 1 from public.room_participants where room_id=r.id and player_id=p.id)
 or exists(select 1 from cadaver_private.authors a join public.room_sessions rs on rs.id=a.session_id where rs.room_id=r.id and a.player_id=p.id)) then
  raise exception 'Sala no disponible.' using errcode='C0001'; end if;
 perform cadaver_private.expire(r.id);
 select * into r from public.rooms where id=r.id;
 select * into cr from cadaver_private.rooms where room_id=r.id;
 select cs.* into s from cadaver_private.sessions cs join public.room_sessions rs on rs.id=cs.id where rs.room_id=r.id;
 sid:=s.id;
 occupied:=exists(select 1 from public.player_active_room_slots where room_id=r.id and player_id=p.id);
 if occupied and r.status<>'closed' then perform cadaver_private.succeed(r.id); select * into r from public.rooms where id=r.id; end if;
 now_at:=clock_timestamp();
 if sid is null then
  select coalesce(jsonb_agg(jsonb_build_object('playerId',rp.player_id,'nickname',pl.nickname,'isSelf',rp.player_id=p.id,
   'isHost',rp.player_id=r.host_player_id,'present',true,'connected',public.is_room_participant_liveness_active(rp.last_seen_at,now_at)) order by rp.joined_at,rp.player_id),'[]') into roster
  from public.room_participants rp join public.players pl on pl.id=rp.player_id where rp.room_id=r.id;
 else
  select a.player_id into writer from cadaver_private.authors a where a.session_id=sid and a.position=((s.next_turn-1) % (select count(*) from cadaver_private.authors where session_id=sid))+1;
  select jsonb_agg(jsonb_build_object('playerId',a.player_id,'nickname',a.nickname,'isSelf',a.player_id=p.id,'isHost',a.player_id=r.host_player_id,
   'present',sl.player_id is not null,'connected',sl.player_id is not null and public.is_room_participant_liveness_active(rp.last_seen_at,now_at)) order by a.position) into roster
  from cadaver_private.authors a left join public.room_participants rp on rp.room_id=r.id and rp.player_id=a.player_id
  left join public.player_active_room_slots sl on sl.room_id=r.id and sl.player_id=a.player_id where a.session_id=sid;
  if s.status='writing' and occupied and writer=p.id and s.next_turn>1 then
   select cadaver_private.words(body) into hint from cadaver_private.contributions where session_id=sid and turn_number=s.next_turn-1;
   hint:=hint[greatest(1,cardinality(hint)-2):cardinality(hint)];
  end if;
 end if;
 return jsonb_build_object('roomId',r.id,'code',r.join_code,'status',coalesce(s.status,cr.closed_reason,'lobby'),
  'playerId',p.id,'occupied',occupied,'isHost',occupied and r.status<>'closed' and r.host_player_id=p.id,
  'roundCount',cr.round_count,'lobbyVersion',cr.lobby_version::text,'participants',roster,'sessionId',sid,
  'turn',case when s.status='writing' then s.next_turn else null end,
  'round',case when s.status='writing' then (s.next_turn-1)/jsonb_array_length(roster)+1 else null end,
  'writerId',case when s.status='writing' then writer else null end,'hint',case when hint is not null then array_to_string(hint,' ') else null end,
  'expiresAt',cr.last_activity_at+interval '24 hours','serverNow',now_at,'closedReason',cr.closed_reason);
end $$;

create function public.return_cadaver_room(target_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players; r public.rooms; other uuid; s uuid;
begin
 p:=cadaver_private.actor();
 select room_id into other from public.player_active_room_slots where player_id=p.id;
 -- Total ordering covers returning while expiring an old occupied Room.
 perform 1 from public.rooms where id in (target_room_id,other) order by id for update;
 if other is not null and other<>target_room_id then perform cadaver_private.expire(other); end if;
 select * into r from public.rooms where id=target_room_id and group_id=p.group_id and game_type='cadaver_exquisito' for update;
 if r.id is null then raise exception 'Sala no disponible.' using errcode='C0001'; end if;
 if r.status='playing' and not exists(select 1 from cadaver_private.authors a join public.room_sessions rs on rs.id=a.session_id where rs.room_id=r.id and a.player_id=p.id) then
  raise exception 'La partida ya comenzó.' using errcode='C0002'; end if;
 if cadaver_private.expire(r.id) then
  -- Existing authors can see the terminal reason. Never insert membership into closed Rooms.
  if exists(select 1 from public.room_participants where room_id=r.id and player_id=p.id) or exists(select 1 from cadaver_private.authors a join public.room_sessions rs on rs.id=a.session_id where rs.room_id=r.id and a.player_id=p.id) then return public.get_cadaver_state(r.id); end if;
  return jsonb_build_object('status','expired');
 end if;
 select room_id into other from public.player_active_room_slots where player_id=p.id;
 if other is not null and other<>r.id then raise exception 'Ya estás en otra sala.' using errcode='P0012'; end if;
 if not exists(select 1 from public.room_participants where room_id=r.id and player_id=p.id) then
  insert into public.room_participants(room_id,group_id,player_id) values(r.id,p.group_id,p.id);
 else
  insert into public.player_active_room_slots(player_id,room_id,group_id) values(p.id,r.id,p.group_id) on conflict(player_id) do nothing;
  if not exists(select 1 from public.player_active_room_slots where player_id=p.id and room_id=r.id) then raise exception 'Ya estás en otra sala.' using errcode='P0012'; end if;
 end if;
 update public.room_participants set last_seen_at=clock_timestamp() where room_id=r.id and player_id=p.id;
 if r.status='lobby' and other is distinct from r.id then update cadaver_private.rooms set lobby_version=lobby_version+1 where room_id=r.id; end if;
 perform cadaver_private.succeed(r.id); perform cadaver_private.signal(r.id);
 return public.get_cadaver_state(r.id);
end $$;

create function public.configure_cadaver_room(target_room_id uuid, requested_round_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb;
begin
 st:=public.get_cadaver_state(target_room_id);
 if st->>'status' in ('expired','cancelled','completed') then return st; end if;
 if not (st->>'isHost')::boolean or st->>'status'<>'lobby' then raise exception 'Solo el anfitrión en lobby.' using errcode='C0003'; end if;
 if requested_round_count is null or requested_round_count not in (3,5,7) then raise exception 'Cantidad de rondas inválida.' using errcode='C0004'; end if;
 update cadaver_private.rooms set round_count=requested_round_count,last_activity_at=clock_timestamp(),lobby_version=lobby_version+1
 where room_id=target_room_id and round_count<>requested_round_count;
 if found then perform cadaver_private.signal(target_room_id); end if;
 return public.get_cadaver_state(target_room_id);
end $$;
create function public.start_cadaver_session(target_room_id uuid, expected_lobby_version text, operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; p public.players; sid uuid; n integer;
begin
 st:=public.get_cadaver_state(target_room_id); p:=cadaver_private.actor();
 if exists(select 1 from public.room_sessions where id=operation_id and room_id=target_room_id and game_type='cadaver_exquisito') then return st; end if;
 if st->>'status' in ('expired','cancelled','completed') then return st; end if;
 if not (st->>'isHost')::boolean or st->>'status'<>'lobby' then raise exception 'Solo el anfitrión en lobby.' using errcode='C0003'; end if;
 if expected_lobby_version is null or st->>'lobbyVersion'<>expected_lobby_version then raise exception 'Cambió la lista. Confirmala nuevamente.' using errcode='C0005'; end if;
 if operation_id is null then raise exception 'Operación requerida.' using errcode='C0004'; end if;
 n:=jsonb_array_length(st->'participants');
 if n<2 then raise exception 'Se necesitan dos participantes.' using errcode='C0006'; end if;
 sid:=operation_id;
 insert into public.room_sessions(id,room_id,group_id,game_type,started_at) values(sid,target_room_id,p.group_id,'cadaver_exquisito',clock_timestamp());
 insert into public.room_session_participants(session_id,group_id,player_id) select sid,p.group_id,rp.player_id from public.room_participants rp where rp.room_id=target_room_id;
 insert into cadaver_private.sessions(id,round_count) values(sid,(st->>'roundCount')::integer);
 insert into cadaver_private.authors(session_id,player_id,position,nickname)
 select sid,rp.player_id,row_number() over(order by random()),pl.nickname from public.room_participants rp join public.players pl on pl.id=rp.player_id where rp.room_id=target_room_id;
 update cadaver_private.rooms set last_activity_at=clock_timestamp() where room_id=target_room_id;
 update public.rooms set status='playing' where id=target_room_id;
 perform cadaver_private.signal(target_room_id);
 return public.get_cadaver_state(target_room_id);
end $$;
create function public.submit_cadaver_contribution(target_room_id uuid, target_session_id uuid, expected_turn integer, operation_id uuid, contribution_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st jsonb; p public.players; s cadaver_private.sessions; prior cadaver_private.contributions; normalized text; n integer;
begin
 -- Authenticate and lock without expiring: committed retries must remain successful.
 p:=cadaver_private.actor();
 perform 1 from public.rooms where id=target_room_id and group_id=p.group_id and game_type='cadaver_exquisito' for update;
 if not found then raise exception 'Sala no disponible.' using errcode='C0001'; end if;
 select cs.* into s from cadaver_private.sessions cs join public.room_sessions rs on rs.id=cs.id where cs.id=target_session_id and rs.room_id=target_room_id for update of cs;
 if s.id is null or not exists(select 1 from cadaver_private.authors where session_id=s.id and player_id=p.id) then raise exception 'Partida no disponible.' using errcode='C0001'; end if;
 normalized:=cadaver_private.normalize_body(contribution_text);
 select * into prior from cadaver_private.contributions c where c.session_id=s.id and c.operation_id=submit_cadaver_contribution.operation_id;
 if prior.session_id is not null then
  if prior.player_id<>p.id or prior.turn_number is distinct from expected_turn or prior.body<>normalized then raise exception 'Operación con contenido distinto.' using errcode='C0007'; end if;
  return public.get_cadaver_state(target_room_id);
 end if;
 st:=public.get_cadaver_state(target_room_id);
 if st->>'status' in ('expired','cancelled') then return st || jsonb_build_object('actionError',case when st->>'status'='expired' then 'C0008' else 'C0002' end); end if;
 if st->>'status'<>'writing' or not (st->>'occupied')::boolean or st->>'writerId'<>p.id::text or expected_turn is distinct from (st->>'turn')::integer then raise exception 'El turno no está disponible.' using errcode='C0002'; end if;
 if operation_id is null or cardinality(cadaver_private.words(normalized)) not between 3 and 50 then raise exception 'Escribí entre 3 y 50 palabras.' using errcode='C0004'; end if;
 insert into cadaver_private.contributions(session_id,turn_number,operation_id,player_id,body) values(s.id,expected_turn,operation_id,p.id,normalized);
 update cadaver_private.rooms set last_activity_at=clock_timestamp() where room_id=target_room_id;
 n:=(select count(*) from cadaver_private.authors where session_id=s.id);
 if expected_turn=s.round_count*n then perform cadaver_private.finish(target_room_id,'completed');
 else update cadaver_private.sessions set next_turn=next_turn+1 where id=s.id; perform cadaver_private.signal(target_room_id); end if;
 return public.get_cadaver_state(target_room_id);
end $$;

create function public.leave_cadaver_room(target_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; pid uuid; p public.players;
begin
 p:=cadaver_private.actor();
 perform 1 from public.rooms where id=target_room_id and group_id=p.group_id and game_type='cadaver_exquisito' for update;
 if not found then raise exception 'Sala no disponible.' using errcode='C0001'; end if;
 -- A lost response to lobby departure is safely retryable without retaining membership.
 if not exists(select 1 from public.room_participants where room_id=target_room_id and player_id=p.id) then
  return jsonb_build_object('left',true);
 end if;
 st:=public.get_cadaver_state(target_room_id); pid:=(st->>'playerId')::uuid;
 if st->>'status' in ('expired','cancelled','completed') then return st; end if;
 delete from public.player_active_room_slots where room_id=target_room_id and player_id=pid;
 if st->>'status'='lobby' then
  delete from public.room_participants where room_id=target_room_id and player_id=pid;
  update cadaver_private.rooms set lobby_version=lobby_version+1 where room_id=target_room_id;
 end if;
 perform cadaver_private.succeed(target_room_id); perform cadaver_private.signal(target_room_id);
 return jsonb_build_object('left',true);
end $$;
create function public.cancel_cadaver_room(target_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb;
begin
 st:=public.get_cadaver_state(target_room_id);
 if st->>'status' in ('completed','cancelled','expired') then return st; end if;
 if not (st->>'isHost')::boolean then raise exception 'Solo el anfitrión activo.' using errcode='C0003'; end if;
 perform cadaver_private.finish(target_room_id,'cancelled'); return public.get_cadaver_state(target_room_id);
end $$;
create function public.heartbeat_cadaver_room(target_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb;
begin
 st:=public.get_cadaver_state(target_room_id);
 if (st->>'occupied')::boolean and st->>'status' in ('lobby','writing') then
  update public.room_participants set last_seen_at=clock_timestamp() where room_id=target_room_id and player_id=(st->>'playerId')::uuid;
  perform cadaver_private.succeed(target_room_id);
 end if;
 return public.get_cadaver_state(target_room_id);
end $$;
create function public.list_cadaver_stories(page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players;
begin
 p:=cadaver_private.actor();
 if page_offset is null or page_offset<0 then raise exception 'Página inválida.' using errcode='C0004'; end if;
 return (select coalesce(jsonb_agg(x),'[]') from (
 select s.id as "sessionId",rs.finished_at as "finishedAt",s.round_count as "roundCount",
 (select jsonb_agg(a.nickname order by a.position) from cadaver_private.authors a where a.session_id=s.id) as participants
 from cadaver_private.sessions s join public.room_sessions rs on rs.id=s.id
 where rs.group_id=p.group_id and s.status='completed' order by rs.finished_at desc,s.id desc limit 20 offset page_offset) x);
end $$;
create function public.get_cadaver_story(target_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players; result jsonb;
begin
 p:=cadaver_private.actor();
 select jsonb_build_object('sessionId',s.id,'finishedAt',rs.finished_at,'roundCount',s.round_count,
 'contributions',(select jsonb_agg(jsonb_build_object('turn',c.turn_number,'author',a.nickname,'text',c.body) order by c.turn_number)
 from cadaver_private.contributions c join cadaver_private.authors a on a.session_id=c.session_id and a.player_id=c.player_id where c.session_id=s.id))
 into result from cadaver_private.sessions s join public.room_sessions rs on rs.id=s.id where s.id=target_session_id and s.status='completed' and rs.group_id=p.group_id;
 if result is null then raise exception 'Historia no disponible.' using errcode='C0001'; end if;
 return result;
end $$;

create function cadaver_private.sweep_expired() returns integer language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
 for r in select rm.id from public.rooms rm join cadaver_private.rooms c on c.room_id=rm.id
 where rm.status in ('lobby','playing') and c.last_activity_at+interval '24 hours'<=clock_timestamp()
 order by rm.id for update of rm skip locked loop
  if cadaver_private.expire(r.id) then n:=n+1; end if;
 end loop;
 return n;
end $$;
create extension if not exists pg_cron;
select cron.schedule('cadaver-expire-rooms','*/15 * * * *','select cadaver_private.sweep_expired()');

-- Shared member entry must invalidate lobby confirmations; payload stays content-free.
create function cadaver_private.membership_signal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from cadaver_private.rooms where room_id=new.room_id) then
  update cadaver_private.rooms set lobby_version=lobby_version+1 where room_id=new.room_id;
  perform cadaver_private.signal(new.room_id);
 end if; return new;
end $$;
create trigger cadaver_membership_signal after insert on public.room_participants for each row execute function cadaver_private.membership_signal();
create or replace function public.create_room(requested_game_type text)
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  new_room_id uuid;
  new_join_code text;
  attempt integer;
  active_game_type text;
begin
  if requested_game_type is null or requested_game_type not in ('impostor', 'tutti_frutti', 'dictionary', 'cadaver_exquisito') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

  if requested_game_type='dictionary' and not public.get_dictionary_availability() then
    raise exception 'Diccionario todavía no está habilitado.' using errcode='D0002';
  end if;
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para crear una sala.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select player_active_room_slots.room_id
    into active_room_id
  from public.player_active_room_slots
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is not null and cadaver_private.expire(active_room_id) then active_room_id:=null; end if;
  if requested_game_type='dictionary' and active_room_id is not null
    and dictionary_private.expire(active_room_id) then active_room_id:=null; end if;
  if active_room_id is null then
    for attempt in 1..8 loop
      new_join_code := public.generate_room_join_code();
      new_room_id := extensions.gen_random_uuid();

      begin
        insert into public.rooms (id, group_id, join_code, host_player_id, game_type)
        values (new_room_id, current_group_id, new_join_code, current_player_id, requested_game_type);

        insert into public.room_participants (room_id, player_id, group_id)
        values (new_room_id, current_player_id, current_group_id);

        active_room_id := new_room_id;
        exit;
      exception
        when unique_violation then
          select player_active_room_slots.room_id
            into active_room_id
          from public.player_active_room_slots
          where player_active_room_slots.player_id = current_player_id;

          if active_room_id is not null then
            exit;
          end if;
      end;
    end loop;

    if active_room_id is null then
      raise exception 'No pudimos generar un código disponible. Intentá crear la sala de nuevo'
        using errcode = 'P0057';
    end if;
  end if;

  select rooms.game_type into active_game_type
  from public.rooms
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing');

  if active_game_type is null then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.' using errcode = 'P0014';
  end if;

  if active_game_type <> requested_game_type then
    raise exception 'Ya estas en una sala activa de otro juego.' using errcode = 'P0029';
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

create or replace function public.join_room_by_code(room_code text, expected_game_type text)
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  normalized_code text;
  target_room_id uuid;
  target_room_group_id uuid;
  target_room_status text;
  target_room_game_type text;
  existing_active_room_id uuid;
  active_room_id uuid;
begin
  if expected_game_type is null or expected_game_type not in ('impostor', 'tutti_frutti', 'dictionary', 'cadaver_exquisito') then
    raise exception 'Juego de sala invalido.' using errcode = 'P0028';
  end if;

  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para unirse a una sala.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  normalized_code := public.normalize_room_join_code(room_code);

  select rooms.id, rooms.group_id, rooms.status, rooms.game_type
    into target_room_id, target_room_group_id, target_room_status, target_room_game_type
  from public.rooms
  where rooms.join_code = normalized_code;

  if target_room_id is null or target_room_group_id <> current_group_id then
    raise exception 'No encontramos esa sala.'
      using errcode = 'P0010';
  end if;

  if target_room_game_type <> expected_game_type then
    raise exception 'El codigo pertenece a otro juego.' using errcode = 'P0030';
  end if;

  if target_room_game_type='cadaver_exquisito' then
    perform public.return_cadaver_room(target_room_id);
    select status into target_room_status from public.rooms where id=target_room_id;
    if target_room_status='closed' then return; end if;
  end if;
  if target_room_game_type<>'cadaver_exquisito' then
    perform 1 from public.rooms where id=target_room_id for update;
    select status into target_room_status from public.rooms where id=target_room_id;
  end if;
  if target_room_game_type='dictionary' and dictionary_private.expire(target_room_id) then return; end if;
  if target_room_status <> 'lobby' and target_room_game_type<>'cadaver_exquisito' then
    raise exception 'Esta sala ya no esta disponible.'
      using errcode = 'P0011';
  end if;

  if exists (
    select 1
    from public.room_participants
    where room_participants.room_id = target_room_id
      and room_participants.player_id = current_player_id
  ) then
    active_room_id := target_room_id;
  else
    select player_active_room_slots.room_id
      into existing_active_room_id
    from public.player_active_room_slots
    where player_active_room_slots.player_id = current_player_id;

    if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
      raise exception 'Ya estas en otra sala.'
        using errcode = 'P0012';
    end if;

    begin
      insert into public.room_participants (room_id, player_id, group_id)
      values (target_room_id, current_player_id, current_group_id);
    exception
      when unique_violation then
        select player_active_room_slots.room_id
          into existing_active_room_id
        from public.player_active_room_slots
        where player_active_room_slots.player_id = current_player_id;

        if existing_active_room_id is not null and existing_active_room_id <> target_room_id then
          raise exception 'Ya estas en otra sala.'
            using errcode = 'P0012';
        end if;
    end;

    active_room_id := target_room_id;
  end if;

  if target_room_game_type='dictionary' then perform dictionary_private.touch(target_room_id); end if;
  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby','playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;
end;
$$;

create or replace function public.get_my_active_room()
returns table (
  room_id uuid,
  room_join_code text,
  room_status text,
  room_game_type text,
  participant_player_id uuid,
  participant_nickname text,
  participant_is_host boolean,
  participant_is_self boolean,
  participant_joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  returned_participant_count integer;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para recuperar la sala activa.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select player_active_room_slots.room_id
    into active_room_id
  from public.player_active_room_slots
  where player_active_room_slots.player_id = current_player_id;

  if active_room_id is null then return; end if;
  if cadaver_private.expire(active_room_id) then return; end if;
  if exists(select 1 from public.rooms where id=active_room_id and game_type='dictionary')
    and dictionary_private.expire(active_room_id) then return; end if;

  select rooms.status
    into active_room_status
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
   and room_participants.player_id = current_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id;

  if active_room_status is null
    or active_room_status not in ('lobby', 'playing') then
    raise exception 'El slot activo no permite reconstruir una Room activa consistente.'
      using errcode = 'P0014';
  end if;

  return query
  select
    rooms.id,
    rooms.join_code,
    rooms.status,
    rooms.game_type,
    room_participants.player_id,
    players.nickname,
    (room_participants.player_id = rooms.host_player_id),
    (room_participants.player_id = current_player_id),
    room_participants.joined_at
  from public.rooms
  join public.room_participants
    on room_participants.room_id = rooms.id
  join public.players
    on players.id = room_participants.player_id
   and players.group_id = rooms.group_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
  order by room_participants.joined_at asc, room_participants.player_id asc;

  get diagnostics returned_participant_count = row_count;

  if returned_participant_count = 0 then
    raise exception 'El slot activo no devolvio participantes para la Room.'
      using errcode = 'P0014';
  end if;
end;
$$;

revoke all on function public.get_my_active_room() from public;
grant execute on function public.get_my_active_room() to authenticated;


create or replace function public.leave_room()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  active_room_host_player_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para salir de una sala.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select
    player_active_room_slots.room_id,
    rooms.status,
    rooms.host_player_id
    into active_room_id, active_room_status, active_room_host_player_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
  for update of rooms;

  if exists(select 1 from public.rooms where id=active_room_id and game_type='cadaver_exquisito') then perform public.leave_cadaver_room(active_room_id); return; end if;

  if active_room_id is null then
    return;
  end if;

  if active_room_status <> 'lobby' then
    return;
  end if;

  if active_room_host_player_id = current_player_id then
    update public.rooms
    set status = 'closed'
    where rooms.id = active_room_id
      and rooms.group_id = current_group_id
      and rooms.status = 'lobby';

    return;
  end if;

  delete from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.player_id = current_player_id
    and room_participants.group_id = current_group_id;
end;
$$;

revoke all on function public.leave_room() from public;
grant execute on function public.leave_room() to authenticated;


create or replace function public.close_room()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  active_room_host_player_id uuid;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para cerrar una sala.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select
    player_active_room_slots.room_id,
    rooms.status,
    rooms.host_player_id
    into active_room_id, active_room_status, active_room_host_player_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
  for update of rooms;

  if exists(select 1 from public.rooms where id=active_room_id and game_type='cadaver_exquisito') then perform public.cancel_cadaver_room(active_room_id); return; end if;

  if active_room_id is null or active_room_status <> 'lobby' then
    raise exception 'No tenes una sala activa para cerrar.'
      using errcode = 'P0015';
  end if;

  if active_room_host_player_id <> current_player_id then
    raise exception 'Solo el host puede cerrar la sala.'
      using errcode = 'P0016';
  end if;

  update public.rooms
  set status = 'closed'
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status = 'lobby';
end;
$$;

revoke all on function public.close_room() from public;
grant execute on function public.close_room() to authenticated;

create or replace function public.reassign_room_host_if_stale()
returns table (
  host_changed boolean,
  current_host_player_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
  active_room_host_player_id uuid;
  active_game_session_id uuid;
  active_shared_session_id uuid;
  active_shared_count integer;
  host_last_seen_at timestamptz;
  successor_player_id uuid;
  observed_at timestamptz;
  updated_room_count integer;
begin
  current_auth_user_id := auth.uid();
  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para reasignar host.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select player_active_room_slots.room_id,
         rooms.status,
         rooms.host_player_id
    into active_room_id, active_room_status, active_room_host_player_id
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id
    and player_active_room_slots.group_id = current_group_id
  for update of rooms;

  if active_room_id is null or active_room_status not in ('lobby', 'playing') then
    host_changed := false;
    current_host_player_id := null;
    return next;
    return;
  end if;

  if exists(select 1 from public.rooms where id=active_room_id and game_type='cadaver_exquisito') then
    if cadaver_private.expire(active_room_id) then host_changed:=false;current_host_player_id:=null;return next;return;end if;
    perform cadaver_private.succeed(active_room_id);
    select host_player_id into current_host_player_id from public.rooms where id=active_room_id;
    host_changed:=current_host_player_id is distinct from active_room_host_player_id;
    return next;return;
  end if;
  if active_room_status = 'playing' then
    select game_sessions.id
      into active_game_session_id
    from public.game_sessions
    where game_sessions.room_id = active_room_id
      and game_sessions.group_id = current_group_id;

    select count(*), (array_agg(room_sessions.id order by room_sessions.id))[1]
      into active_shared_count, active_shared_session_id
    from public.room_sessions
    where room_sessions.room_id = active_room_id
      and room_sessions.group_id = current_group_id
      and room_sessions.finished_at is null;

    if active_shared_count > 1 then
      raise exception 'La Room tiene mas de una sesion compartida activa.'
        using errcode = 'P0022',
              detail = 'host succession: multiple active neutral sessions';
    end if;

    if active_game_session_id is not null and active_shared_count = 0 then
      raise exception 'La sesion de juego activa no tiene espejo neutral.'
        using errcode = 'P0022',
              detail = 'host succession: active game session without neutral mirror';
    end if;

    if active_shared_count = 1
      and active_game_session_id is not null
      and active_shared_session_id is distinct from active_game_session_id then
      raise exception 'La sesion neutral activa no coincide con la sesion de juego.'
        using errcode = 'P0022',
              detail = 'host succession: neutral session identity mismatch';
    end if;
  end if;

  observed_at := now();

  select room_participants.last_seen_at
    into host_last_seen_at
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.player_id = active_room_host_player_id
    and room_participants.group_id = current_group_id
  for update;

  if not found
    or public.is_room_participant_liveness_active(host_last_seen_at, observed_at) then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  select room_participants.player_id
    into successor_player_id
  from public.room_participants
  where room_participants.room_id = active_room_id
    and room_participants.group_id = current_group_id
    and room_participants.player_id <> active_room_host_player_id
    and public.is_room_participant_liveness_active(
      room_participants.last_seen_at,
      observed_at
    )
    and (
      active_room_status = 'lobby'
      or exists (
        select 1
        from public.room_session_participants
        where room_session_participants.session_id = active_shared_session_id
          and room_session_participants.group_id = current_group_id
          and room_session_participants.player_id = room_participants.player_id
      )
    )
  order by room_participants.joined_at asc, room_participants.player_id asc
  limit 1;

  if successor_player_id is null then
    host_changed := false;
    current_host_player_id := active_room_host_player_id;
    return next;
    return;
  end if;

  update public.rooms
  set host_player_id = successor_player_id
  where rooms.id = active_room_id
    and rooms.group_id = current_group_id
    and rooms.status in ('lobby', 'playing')
    and rooms.host_player_id = active_room_host_player_id;

  get diagnostics updated_room_count = row_count;
  host_changed := updated_room_count = 1;
  current_host_player_id := successor_player_id;
  return next;
end;
$$;


-- Default privileges are denied for both private helpers and public RPCs.
do $$ declare obj record; begin
 for obj in select tablename from pg_tables where schemaname='cadaver_private' loop
  execute format('alter table cadaver_private.%I enable row level security',obj.tablename);
  execute format('revoke all on table cadaver_private.%I from public,anon,authenticated',obj.tablename);
 end loop;
end $$;
revoke all on all functions in schema cadaver_private from public,anon,authenticated;
grant execute on function cadaver_private.can_receive(uuid) to authenticated;
revoke all on function public.get_cadaver_state(uuid,text),public.return_cadaver_room(uuid),public.configure_cadaver_room(uuid,integer),
 public.start_cadaver_session(uuid,text,uuid),public.submit_cadaver_contribution(uuid,uuid,integer,uuid,text),public.leave_cadaver_room(uuid),
 public.cancel_cadaver_room(uuid),public.heartbeat_cadaver_room(uuid),public.list_cadaver_stories(integer),public.get_cadaver_story(uuid) from public,anon;
grant execute on function public.get_cadaver_state(uuid,text),public.return_cadaver_room(uuid),public.configure_cadaver_room(uuid,integer),
 public.start_cadaver_session(uuid,text,uuid),public.submit_cadaver_contribution(uuid,uuid,integer,uuid,text),public.leave_cadaver_room(uuid),
 public.cancel_cadaver_room(uuid),public.heartbeat_cadaver_room(uuid),public.list_cadaver_stories(integer),public.get_cadaver_story(uuid) to authenticated;
revoke all on function public.create_room(text),public.join_room_by_code(text,text),public.get_my_active_room(),public.leave_room(),public.close_room(),public.reassign_room_host_if_stale() from public,anon;

-- Cadáver's inactive host reference is historical authority, not an occupied slot.
-- Other games retain their host uniqueness; player_active_room_slots enforces cross-game occupancy.
drop index public.rooms_active_host_player_key;
create unique index rooms_active_host_player_key on public.rooms(host_player_id)
 where status in ('lobby','playing') and game_type<>'cadaver_exquisito';

create or replace function public.refresh_my_room_liveness()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  current_player_id uuid;
  current_group_id uuid;
  active_room_id uuid;
  active_room_status text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    raise exception 'Se necesita una AuthIdentity valida para refrescar liveness.'
      using errcode = '28000';
  end if;

  select players.id, players.group_id
    into current_player_id, current_group_id
  from public.players
  where players.auth_user_id = current_auth_user_id;

  if current_player_id is null or current_group_id is null then
    raise exception 'Esta AuthIdentity no tiene un Player asociado.'
      using errcode = 'P0002';
  end if;

  select
    player_active_room_slots.room_id,
    rooms.status
    into active_room_id, active_room_status
  from public.player_active_room_slots
  join public.rooms
    on rooms.id = player_active_room_slots.room_id
   and rooms.group_id = player_active_room_slots.group_id
  where player_active_room_slots.player_id = current_player_id;

  if exists(select 1 from public.rooms where id=active_room_id and game_type='cadaver_exquisito') then
    perform public.heartbeat_cadaver_room(active_room_id); return;
  end if;
  if active_room_id is null
    or active_room_status not in ('lobby', 'playing') then
    return;
  end if;

  update public.room_participants
  set last_seen_at = now()
  where room_participants.room_id = active_room_id
    and room_participants.player_id = current_player_id
    and room_participants.group_id = current_group_id
    and (
      room_participants.last_seen_at is null
      or room_participants.last_seen_at <= now() - interval '10 seconds'
    );
end;
$$;

revoke all on function public.refresh_my_room_liveness() from public;
grant execute on function public.refresh_my_room_liveness() to authenticated;
