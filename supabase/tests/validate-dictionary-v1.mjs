import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

// Deliberately separate from the user's Supabase DB. No remote or default-target fallback.
const db = process.env.DICTIONARY_TEST_DB_URL;
if (!db || !["localhost","127.0.0.1","[::1]"].includes(new URL(db).hostname) || new URL(db).port !== "55432")
  throw new Error("DICTIONARY_TEST_DB_URL must identify the disposable loopback test DB on port 55432.");
const run = promisify(execFile);
const sql = text => execFileSync("psql", [db,"-XqAt","-v","ON_ERROR_STOP=1","-c",text], {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
if (sql("select coalesce(shobj_description(oid,'pg_database'),'') from pg_database where datname=current_database()") !== "dictionary-disposable-test")
  throw new Error("Refusing writes: disposable database marker missing.");
process.on("exit",()=>{try{sql("select dictionary_private.set_enabled(false)");}catch{/* DDL validation can fail before settings exists. */}});
const q = value => "'"+String(value).replaceAll("'","''")+"'";
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const equal=(actual,expected,message)=>assert(actual===expected,`${message}: expected ${expected}; got ${actual}`);
let checks=0;
function check(condition,message){assert(condition,message);checks++;}
function command(user, fn, args={}) {
  const named=Object.entries(args).map(([k,v])=>`${k}=>${typeof v==="number"?v:v===null?"null":q(v)}`).join(",");
  return `begin;set local role authenticated;set local request.jwt.claim.sub=${q(user)};select public.${fn}(${named});commit;`;
}
function rpc(user,fn,args={}){return JSON.parse(sql(command(user,fn,args)));}
async function concurrent(user,fn,args={}){const {stdout}=await run("psql",[db,"-XqAt","-v","ON_ERROR_STOP=1","-c",command(user,fn,args)]);return JSON.parse(stdout.trim());}
function rejects(user,fn,args,code){try{rpc(user,fn,args);throw new Error("Unexpected success");}catch(e){assert(e.stderr?.includes(code)||e.stderr?.includes(expectedMessages[code]??code),`${fn} must reject ${code}: ${e.stderr??e.message}`);checks++;}}
const expectedMessages={D0002:"300 entradas",D0003:"no está disponible",D0004:"Sólo el anfitrión",D0005:"al menos 3",D0006:"No alcanzan",D0007:"ya terminó",D0008:"definición ajena"};
const migration = readdirSync(new URL("../migrations/",import.meta.url)).find(n=>n.endsWith("_dictionary_v1.sql"));
if(sql("select to_regclass('dictionary_private.cards') is not null")==="f"){
 const ddl=readFileSync(new URL(`../migrations/${migration}`,import.meta.url),"utf8");
 sql("begin;"+ddl+";commit;");
}
// A schema-only copy has no catalogue or users. Re-runs use fresh IDs and reset only test catalogue gate state.
sql("select dictionary_private.set_enabled(false); update dictionary_private.cards set status='draft',reviewed_by=null,reviewed_at=null where word='Fixture 300'");
for(const role of ["anon","authenticated"]){for(const table of ["cards","word_usage","options","definitions","votes","settings"]){
 let denied=false;try{sql(`set role ${role};select * from dictionary_private.${table};`);}catch{denied=true;}check(denied,`${role} cannot read ${table} directly`);
}}
let denied=false;try{sql("set role authenticated;select dictionary_private.set_enabled(true)");}catch{denied=true;}check(denied,"client cannot activate game");
// These are synthetic fixtures, not human-reviewed catalogue content. This DB is disposable.
sql(`insert into dictionary_private.cards(word,sense,definition,difficulty,verification_reference,status,reviewed_by,reviewed_at)
select 'Fixture '||n,'Synthetic testing sense','Definición de prueba '||n||'.','medium','synthetic:test-only','reviewed','AUTOMATED FIXTURE, NOT HUMAN REVIEW',now() from generate_series(1,299) n on conflict(normalized_word) do nothing`);
try{sql("select dictionary_private.set_enabled(true)");throw new Error("gate accepted 299");}catch(e){assert(e.stderr?.includes("300 entradas"),"gate must reject 299");checks++;}
sql("insert into dictionary_private.cards(word,sense,definition,difficulty,verification_reference,status,reviewed_by,reviewed_at) values('Fixture 300','Synthetic testing sense','Definición de prueba 300.','medium','synthetic:test-only','reviewed','AUTOMATED FIXTURE, NOT HUMAN REVIEW',now()) on conflict(normalized_word) do update set status='reviewed',reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;select dictionary_private.set_enabled(true)");
check(sql("select public.get_dictionary_availability() ")==="t","gate accepts 300");
function group(size=4){
 const gid=randomUUID(),people=Array.from({length:size},()=>({user:randomUUID(),player:randomUUID()}));
 sql("begin;"+people.map((p,i)=>`insert into auth.users(id) values(${q(p.user)});insert into public.players(id,group_id,auth_user_id,nickname) values(${q(p.player)},${q(gid)},${q(p.user)},'Jugador ${i+1}');`).join("")+`insert into public.groups(id,name,admin_player_id) values(${q(gid)},'Dictionary test',${q(people[0].player)});commit;`);
 return {gid,people};
}
const {gid,people}=group(),[host,second,third,newcomer]=people;
const outsider=group(1).people[0];
function roomFor(person){return rpc(person.user,"create_room",{requested_game_type:"dictionary"});}
// Table RPCs serialize as composite strings; use SQL->jsonb for the shared entry contract.
function shared(user,fn,args){return JSON.parse(sql(command(user,fn,args).replace(`select public.${fn}(`,`select to_jsonb(x) from public.${fn}(`).replace(");commit;", ") x;commit;")).split("\n")[0]);}
function room(){return shared(host.user,"create_room",{requested_game_type:"dictionary"});}
let rm=room();
const rid=rm.room_id;
equal(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(outsider.user)};select count(*) from public.dictionary_signals where room_id=${q(rid)};commit;`),"0","outsider cannot read signals");
equal(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(host.user)};select count(*) from public.dictionary_signals where room_id=${q(rid)};commit;`),"1","member can read generic signal");
rejects(host.user,"start_dictionary_session",{target_room_id:rid,request_id:randomUUID()},"D0005");
for(const p of [second,third])shared(p.user,"join_room_by_code",{room_code:rm.room_join_code,expected_game_type:"dictionary"});
rejects(outsider.user,"get_dictionary_state",{target_room_id:rid},"D0003");
rejects(second.user,"save_dictionary_configuration",{target_room_id:rid,requested_round_count:3},"D0004");
rpc(host.user,"save_dictionary_configuration",{target_room_id:rid,requested_round_count:3});
const key=randomUUID();let state=rpc(host.user,"start_dictionary_session",{target_room_id:rid,request_id:key});
equal(state.round.phase,"WRITING","starts in writing");
equal(rpc(host.user,"start_dictionary_session",{target_room_id:rid,request_id:key}).sessionId,state.sessionId,"start retry");
let joinRejected=false;try{shared(newcomer.user,"join_room_by_code",{room_code:rm.room_join_code,expected_game_type:"dictionary"});}catch{joinRejected=true;}check(joinRejected,"no midgame join");
const session=state.sessionId,words=[];
for(let n=1;n<=3;n++){
 const round=state.round;words.push(round.word);
 const text="instrumento   que sirve\npara inventar";
 await Promise.all([host,second,third].flatMap(p=>[concurrent(p.user,"submit_dictionary_definition",{target_room_id:rid,target_round_id:round.id,definition_text:text}),concurrent(p.user,"submit_dictionary_definition",{target_room_id:rid,target_round_id:round.id,definition_text:text})]));
 state=rpc(host.user,"get_dictionary_state",{target_room_id:rid});
 equal(state.round.phase,"VOTING","last submission opens voting");equal(state.round.options.length,4,"one option per player plus real");
 check(state.round.options.every(o=>!Object.hasOwn(o,"isReal")&&!Object.hasOwn(o,"author")&&!Object.hasOwn(o,"createdAt")),"voting response has no answer/author/timestamps");
 equal(state.round.ownDefinition,"Instrumento que sirve para inventar.","normalization");
 const recovered=rpc(second.user,"get_dictionary_state",{target_room_id:rid});
 equal(JSON.stringify(state.round.options.map(o=>[o.id,o.position])),JSON.stringify(recovered.round.options.map(o=>[o.id,o.position])),"stable shared order");
 rejects(host.user,"submit_dictionary_vote",{target_room_id:rid,target_round_id:round.id,target_option_id:state.round.options.find(o=>!o.canVote).id},"D0008");
 const real=sql(`select id from dictionary_private.options where round_id=${q(round.id)} and is_real`);
 await Promise.all([host,second,third].flatMap(p=>[concurrent(p.user,"submit_dictionary_vote",{target_room_id:rid,target_round_id:round.id,target_option_id:real}),concurrent(p.user,"submit_dictionary_vote",{target_room_id:rid,target_round_id:round.id,target_option_id:real})]));
 state=rpc(host.user,"get_dictionary_state",{target_room_id:rid});equal(state.round.phase,"RESULT","last vote reveals");
 check(state.totals.every(p=>p.totalPoints===n),"scoring exactly once");
 check(state.round.options.every(o=>Object.hasOwn(o,"isReal")&&Object.hasOwn(o,"author")&&!Object.hasOwn(o,"voterIds")),"result has authors and aggregates only");
 if(n<3){
  rejects(second.user,"advance_dictionary_round",{target_room_id:rid,target_round_id:round.id},"D0004");
  await Promise.all([concurrent(host.user,"advance_dictionary_round",{target_room_id:rid,target_round_id:round.id}),concurrent(host.user,"advance_dictionary_round",{target_room_id:rid,target_round_id:round.id})]);
  state=rpc(host.user,"get_dictionary_state",{target_room_id:rid});equal(state.round.number,n+1,"advance retry advances once");
 }
}
equal(state.endedReason,"completed","final round completes");equal(state.roomStatus,"lobby","returns Room to lobby");
check(new Set(words).size===3,"no repeat within session");
shared(newcomer.user,"join_room_by_code",{room_code:rm.room_join_code,expected_game_type:"dictionary"});
const fresh=rpc(newcomer.user,"get_dictionary_state",{target_room_id:rid});check(fresh.sessionId===null&&fresh.round===null,"new lobby participant cannot read previous session");
rejects(newcomer.user,"get_dictionary_state",{target_session_id:session},"D0003");
state=rpc(host.user,"start_dictionary_session",{target_room_id:rid,request_id:randomUUID()});check(!words.includes(state.round.word),"no repeat across games");
const partial=state.sessionId;
state=rpc(host.user,"finish_dictionary_session",{target_room_id:rid,target_session_id:partial});
equal(state.endedReason,"host_ended","partial result reason");equal(state.round,null,"incomplete round never revealed");equal(state.resolvedRounds,0,"no false resolved rounds");
equal(sql(`select count(*) from dictionary_private.word_usage where session_id=${q(partial)}`),"1","only presented word remains consumed");
// Old partial result is stable through rematches.
state=rpc(host.user,"start_dictionary_session",{target_room_id:rid,request_id:randomUUID()});
equal(rpc(second.user,"get_dictionary_state",{target_session_id:partial}).endedReason,"host_ended","stable partial result");
sql(`update dictionary_private.rooms set last_activity_at=now()-interval '25 hours' where room_id=${q(rid)}`);
state=rpc(host.user,"heartbeat_dictionary_room",{target_room_id:rid});
equal(state.closedReason,"inactivity","heartbeat cannot revive expired room");equal(state.roomStatus,"closed","expired room closed");equal(sql(`select count(*) from public.player_active_room_slots where room_id=${q(rid)}`),"0","expiration releases slots");
equal(sql(`select count(*) from dictionary_private.word_usage where session_id=${q(state.sessionId)}`),"1","abandoned first word stays consumed");
// Duration limit applies despite fresh activity; sweeps are idempotent.
rm=room();for(const p of [second,third])shared(p.user,"join_room_by_code",{room_code:rm.room_join_code,expected_game_type:"dictionary"});
state=rpc(host.user,"start_dictionary_session",{target_room_id:rm.room_id,request_id:randomUUID()});
sql(`update public.room_sessions set started_at=now()-interval '73 hours' where id=${q(state.sessionId)};select dictionary_private.sweep_expired();select dictionary_private.sweep_expired()`);
equal(rpc(host.user,"get_dictionary_state",{target_room_id:rm.room_id}).closedReason,"duration","absolute duration enforced");
// Concurrent rooms of the same Group reserve disjoint sets.
const parallelGroup=group(6),players=parallelGroup.people;
const left=shared(players[0].user,"create_room",{requested_game_type:"dictionary"});
const right=shared(players[3].user,"create_room",{requested_game_type:"dictionary"});
for(const [owner,members] of [[left,players.slice(1,3)],[right,players.slice(4,6)]]){
 for(const member of members)shared(member.user,"join_room_by_code",{room_code:owner.room_join_code,expected_game_type:"dictionary"});
 rpc(owner===left?players[0].user:players[3].user,"save_dictionary_configuration",{target_room_id:owner.room_id,requested_round_count:3});
}
const [ls,rs]=await Promise.all([
 concurrent(players[0].user,"start_dictionary_session",{target_room_id:left.room_id,request_id:randomUUID()}),
 concurrent(players[3].user,"start_dictionary_session",{target_room_id:right.room_id,request_id:randomUUID()})]);
equal(sql(`select count(distinct card_id) from dictionary_private.word_usage where group_id=${q(parallelGroup.gid)}`),"6","concurrent reservations disjoint");
// Without a live successor there is no transfer. A returning roster member becomes eligible.
sql(`update public.room_participants set last_seen_at=now()-interval '10 minutes' where room_id=${q(left.room_id)}`);
const absent=shared(players[1].user,"reassign_room_host_if_stale",{});
check(absent.host_changed===false,"no host transfer without eligible successor");
const takeover=rpc(players[1].user,"heartbeat_dictionary_room",{target_room_id:left.room_id});
check(takeover.isHost,"live frozen-roster member succeeds stale host");
check(!rpc(players[0].user,"heartbeat_dictionary_room",{target_room_id:left.room_id}).isHost,"old host does not reclaim authority");
rpc(players[1].user,"finish_dictionary_session",{target_room_id:left.room_id,target_session_id:ls.sessionId});
rpc(players[3].user,"finish_dictionary_session",{target_room_id:right.room_id,target_session_id:rs.sessionId});
// Exhaustion is based on eligible Group words, not global catalogue count.
sql(`insert into dictionary_private.word_usage(group_id,card_id,session_id,presented)
 select ${q(parallelGroup.gid)},c.id,${q(ls.sessionId)},true from dictionary_private.cards c
 where not exists(select 1 from dictionary_private.word_usage u where u.group_id=${q(parallelGroup.gid)} and u.card_id=c.id)
 order by c.id limit 296`);
rejects(players[1].user,"start_dictionary_session",{target_room_id:left.room_id,request_id:randomUUID()},"D0006");
check(rpc(players[1].user,"get_dictionary_state",{target_room_id:left.room_id}).availableRounds.length===0,"fewer than 3 eligible words disables all presets");
// Authorization covers unlinked identities and all normalized text constraints.
rejects(randomUUID(),"get_dictionary_state",{target_room_id:left.room_id},"D0003");
for(const [raw,expected] of [["  acción\n y   efecto de inventar ","Acción y efecto de inventar."],["¿objeto?","¿Objeto?"],["ejemplo!","Ejemplo!"]]){
 equal(sql(`select dictionary_private.normalize_definition(${q(raw)})`),expected,"backend normalization");
}
for(const raw of ["  ","a".repeat(301)]){let rejected=false;try{sql(`select dictionary_private.normalize_definition(${q(raw)})`);}catch{rejected=true;}check(rejected,"invalid text rejected in backend");}

// Shared entry keeps both existing game types and active-room recovery working.
for(const game of ["impostor","tutti_frutti"]){
 const legacy=group(3),owner=legacy.people[0];
 const lobby=shared(owner.user,"create_room",{requested_game_type:game});
 for(const member of legacy.people.slice(1))shared(member.user,"join_room_by_code",{room_code:lobby.room_join_code,expected_game_type:game});
 equal(shared(owner.user,"get_my_active_room",{}).room_game_type,game,"legacy active Room game preserved");
 sql(command(owner.user,"close_room",{}));
}
const exitGroup=group(3),[exitHost,exitMember]=exitGroup.people;
let exitRoom=shared(exitHost.user,"create_room",{requested_game_type:"dictionary"});
shared(exitMember.user,"join_room_by_code",{room_code:exitRoom.room_join_code,expected_game_type:"dictionary"});
sql(command(exitMember.user,"leave_dictionary_room",{target_room_id:exitRoom.room_id}));
equal(rpc(exitHost.user,"get_dictionary_state",{target_room_id:exitRoom.room_id}).lobbyParticipants.length,1,"leaving updates lobby membership");
sql(command(exitHost.user,"leave_dictionary_room",{target_room_id:exitRoom.room_id}));
equal(rpc(exitHost.user,"get_dictionary_state",{target_room_id:exitRoom.room_id}).closedReason,"host_closed","host close has explicit reason");
exitRoom=shared(exitHost.user,"create_room",{requested_game_type:"dictionary"});
sql(`update dictionary_private.rooms set last_activity_at=now()-interval '25 hours' where room_id=${q(exitRoom.room_id)}`);
const replacement=shared(exitHost.user,"create_room",{requested_game_type:"dictionary"});
check(replacement.room_id!==exitRoom.room_id,"create never revives an expired active slot");
equal(rpc(exitHost.user,"get_dictionary_state",{target_room_id:exitRoom.room_id}).closedReason,"inactivity","expired creation path preserves close reason");

// Disabled game prevents new creation but leaves result reads available.
sql("select dictionary_private.set_enabled(false)");
check(rpc(second.user,"get_dictionary_state",{target_session_id:session}).endedReason==="completed","flag off preserves results");
let disabled=false;try{room();}catch(e){disabled=e.stderr?.includes("no está habilitado");}check(disabled,"flag off blocks creation");
console.log(`Diccionario DB validation passed (${checks} assertions plus complete 3-round concurrent flow). Flag restored off.`);
