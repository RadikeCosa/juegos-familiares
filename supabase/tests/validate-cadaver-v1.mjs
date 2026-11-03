import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
const db=process.env.CADAVER_TEST_DB_URL;
if(!db || !["localhost","127.0.0.1","[::1]"].includes(new URL(db).hostname) || new URL(db).port!=="55433") throw Error("CADAVER_TEST_DB_URL must identify the disposable loopback DB on port 55433");
const run=promisify(execFile),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const sql=t=>execFileSync("psql",[db,"-XqAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-c",t],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
if(sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=="cadaver-disposable-test")throw Error("Disposable marker missing");
let checks=0;const check=(v,m)=>{if(!v)throw Error(m);checks++;};const equal=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),`${m}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
for(const [object,suffix] of [["to_regprocedure('public.normalize_room_join_code(text)')","_readable_room_codes.sql"],["to_regclass('dictionary_private.rooms')","_dictionary_v1.sql"],["to_regclass('cadaver_private.rooms')","_cadaver_exquisito_v1.sql"]]) {
 if(sql(`select ${object} is not null`)==="t")continue;
 const file=readdirSync(new URL('../migrations/',import.meta.url)).find(n=>n.endsWith(suffix));
 sql("begin;"+readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8')+";commit;");
}
function command(user,fn,args={},role="authenticated"){
 const argsSql=Object.entries(args).map(([k,v])=>`${k}=>${v===null?'null':typeof v==='number'?v:q(v)}`).join(',');
 return `begin;set local role ${role};set local request.jwt.claim.sub=${q(user??'')};select public.${fn}(${argsSql});commit;`;
}
function rpc(p,fn,args={}){return JSON.parse(sql(command(p?.user,fn,args)));}
function shared(p,fn,args={}){const t=command(p.user,fn,args).replace(`select public.${fn}(`,`select to_jsonb(x) from public.${fn}(`).replace(');commit;',') x;commit;');return sql(t).split('\n').filter(Boolean).map(JSON.parse)[0];}
async function concurrent(p,fn,args){try{const {stdout}=await run('psql',[db,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',command(p.user,fn,args)]);return {ok:true,data:JSON.parse(stdout.trim())};}catch(e){return {ok:false,error:e.stderr};}}
function rejects(p,fn,args,code){let denied=false;try{rpc(p,fn,args);}catch(e){denied=!!e.stderr?.includes(code);}check(denied,`${fn} must reject ${code}`);}
function deniedQuery(t){let denied=false;try{sql(t);}catch{denied=true;}check(denied,'query must deny');}
function group(size=4){const gid=randomUUID(),people=Array.from({length:size},()=>({user:randomUUID(),player:randomUUID()}));sql('begin;'+people.map((p,i)=>`insert into auth.users(id) values(${q(p.user)});insert into public.players(id,group_id,auth_user_id,nickname) values(${q(p.player)},${q(gid)},${q(p.user)},'Autor ${i+1}');`).join('')+`insert into public.groups(id,name,admin_player_id) values(${q(gid)},'Cadáver test',${q(people[0].player)});commit;`);return {gid,people};}
const {gid,people}=group(),[host,second,third,reader]=people, outsider=group(1).people[0];
function room(p=host){return shared(p,'create_room',{requested_game_type:'cadaver_exquisito'});}
function state(p,r){return rpc(p,'get_cadaver_state',{target_room_id:r.room_id});}
function join(p,r){return shared(p,'join_room_by_code',{room_code:r.room_join_code.toLowerCase(),expected_game_type:'cadaver_exquisito'});}
function start(p,r){const st=state(p,r);return rpc(p,'start_cadaver_session',{target_room_id:r.room_id,expected_lobby_version:st.lobbyVersion,operation_id:randomUUID()});}
function args(st,text='Una hermosa historia continúa.',id=randomUUID()){return {target_room_id:st.roomId,target_session_id:st.sessionId,expected_turn:st.turn,operation_id:id,contribution_text:text};}
const find=st=>people.find(p=>p.player===st.writerId);
for(const role of ['anon','authenticated'])for(const table of ['rooms','sessions','authors','contributions'])deniedQuery(`set role ${role};select * from cadaver_private.${table}`);
for(const fn of ['get_cadaver_state','return_cadaver_room','configure_cadaver_room','start_cadaver_session','submit_cadaver_contribution','leave_cadaver_room','cancel_cadaver_room','heartbeat_cadaver_room','list_cadaver_stories','get_cadaver_story']){
 check(sql(`select not has_function_privilege('anon',p.oid,'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=${q(fn)}`)==='t',`${fn} denies anon`);
 check(sql(`select prosecdef and proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=${q(fn)}`)==='t',`${fn} fixed search_path`);
}
rejects(null,'list_cadaver_stories',{},'28000');
const noPlayer={user:randomUUID()};sql(`insert into auth.users(id) values(${q(noPlayer.user)})`);rejects(noPlayer,'list_cadaver_stories',{},'C0001');
for(const f of JSON.parse(readFileSync(new URL('../../lib/cadaver-exquisito/word-fixtures.json',import.meta.url),'utf8'))){equal(JSON.parse(sql(`select to_json(cadaver_private.words(${q(f.text)}))`)),f.words,'SQL word fixtures');}
let r=room();let st=state(host,r);
check(st.occupied&&st.isHost&&st.roundCount===3,'initial lobby');
check(Date.parse(st.expiresAt)-Date.parse(st.serverNow)>86_390_000,'server clock expiry');
rejects(host,'start_cadaver_session',{target_room_id:r.room_id,expected_lobby_version:st.lobbyVersion,operation_id:randomUUID()},'C0006');
rejects(outsider,'get_cadaver_state',{target_room_id:r.room_id},'C0001');
const version=st.lobbyVersion;join(second,r);join(third,r);
rejects(host,'start_cadaver_session',{target_room_id:r.room_id,expected_lobby_version:version,operation_id:randomUUID()},'C0005');
rejects(second,'configure_cadaver_room',{target_room_id:r.room_id,requested_round_count:7},'C0003');
const signal=p=>sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(p.user)};select count(*) from public.cadaver_signals where room_id=${q(r.room_id)};commit;`);
equal(signal(reader),'0','group nonparticipant no signals');equal(signal(outsider),'0','other group no signals');equal(signal(host),'1','occupant signal');
st=start(host,r);equal(st.status,'writing','starts writing');equal(st.hint,null,'initial no hint');
const order=st.participants.map(p=>p.playerId);equal(state(second,r).participants.map(p=>p.playerId),order,'stable order');
try{join(reader,r);throw Error('midgame join accepted');}catch(e){check(e.stderr?.includes('C0002'),'no midgame join');}
rejects(people.find(p=>p.player!==st.writerId),'submit_cadaver_contribution',args(st),'C0002');
rejects(find(st),'submit_cadaver_contribution',args(st,'uno dos'),'C0004');
rejects(find(st),'submit_cadaver_contribution',args(st,Array(51).fill('palabra').join(' ')),'C0004');
const first=args(st),firstWriter=find(st);const pair=await Promise.all([concurrent(firstWriter,'submit_cadaver_contribution',first),concurrent(firstWriter,'submit_cadaver_contribution',first)]);
check(pair.every(x=>x.ok),'duplicate concurrent sends both succeed');equal(pair[0].data.turn,2,'one advance');
st=state(host,r);equal(st.turn,2,'authoritative next turn');
const wr=find(st);equal(state(wr,r).hint,'hermosa historia continúa.','only trailing words');
check([host,second,third].filter(p=>p.player!==st.writerId).every(p=>state(p,r).hint===null),'others get no hint');
rejects(firstWriter,'submit_cadaver_contribution',{...first,contribution_text:'Otra versión muy distinta.'},'C0007');
rejects(host,'get_cadaver_story',{target_session_id:st.sessionId},'C0001');
// Abandon frees slot, preserves frozen order and no activity touch.
const before=sql(`select last_activity_at from cadaver_private.rooms where room_id=${q(r.room_id)}`);
rpc(wr,'leave_cadaver_room',{target_room_id:r.room_id});equal(signal(wr),'0','abandoned member no signal access');
equal(state(host,r).turn,2,'leave no skip');check(!state(wr,r).occupied,'left visible');
equal(sql(`select last_activity_at from cadaver_private.rooms where room_id=${q(r.room_id)}`),before,'leave no renewal');
rejects(wr,'submit_cadaver_contribution',args(st),'C0002');
const other=shared(wr,'create_room',{requested_game_type:'impostor'});check(!!other,'abandoned author can create other game');
rejects(wr,'return_cadaver_room',{target_room_id:r.room_id},'P0012');sql(command(wr.user,'close_room'));
rpc(wr,'return_cadaver_room',{target_room_id:r.room_id});equal(signal(wr),'1','return signal access');
equal(sql(`select last_activity_at from cadaver_private.rooms where room_id=${q(r.room_id)}`),before,'return no renewal');
let last,lastWriter;
while(st.status==='writing'){st=state(host,r);if(st.status!=='writing')break;last=args(st);lastWriter=find(st);st=rpc(lastWriter,'submit_cadaver_contribution',last);}
equal(st.status,'completed','last submission completes');equal(sql(`select count(*) from public.player_active_room_slots where room_id=${q(r.room_id)}`),'0','completion releases slots');
equal(rpc(lastWriter,'submit_cadaver_contribution',last).status,'completed','last retry success');
const story=rpc(reader,'get_cadaver_story',{target_session_id:st.sessionId});equal(story.contributions.length,9,'all turns');check(story.contributions.every(c=>!!c.author),'attribution');
equal(rpc(reader,'list_cadaver_stories')[0].sessionId,st.sessionId,'group library');rejects(outsider,'get_cadaver_story',{target_session_id:st.sessionId},'C0001');
rpc(host,'cancel_cadaver_room',{target_room_id:r.room_id});equal(rpc(reader,'get_cadaver_story',{target_session_id:st.sessionId}).contributions.length,9,'completed never cancelled');
// Rounds 5 and 7, roster 2, including 50-word boundaries.
for(const rounds of [5,7]){r=room();join(second,r);rpc(host,'configure_cadaver_room',{target_room_id:r.room_id,requested_round_count:rounds});st=start(host,r);let turns=0;while(st.status==='writing'){st=rpc(find(st),'submit_cadaver_contribution',args(st,Array(50).fill('palabra').join(' ')));turns++;}equal(turns,rounds*2,'configured total');}
// Cancellation removes text and operation identity together.
r=room();join(second,r);st=start(host,r);const accepted=args(st);rpc(find(st),'submit_cadaver_contribution',accepted);st=state(host,r);rpc(host,'cancel_cadaver_room',{target_room_id:r.room_id});
equal(sql(`select count(*) from cadaver_private.contributions where session_id=${q(st.sessionId)}`),'0','cancel deletes contributions');
const cancelled=rpc(firstWriter.player===accepted.playerId?firstWriter:people.find(p=>p.player===order[0]),'list_cadaver_stories');check(Array.isArray(cancelled),'library still valid');
// Expiry is persisted by state reads before cron; return at 23:50 preserves deadline.
r=room();join(second,r);st=start(host,r);const writer=find(st);rpc(writer,'leave_cadaver_room',{target_room_id:r.room_id});
sql(`update cadaver_private.rooms set last_activity_at=clock_timestamp()-interval '23 hours 50 minutes' where room_id=${q(r.room_id)}`);
const returning=rpc(writer,'return_cadaver_room',{target_room_id:r.room_id});check(Date.parse(returning.expiresAt)-Date.parse(returning.serverNow)<601_000,'return at 23:50 only 10 minutes');
sql(`update cadaver_private.rooms set last_activity_at=clock_timestamp()-interval '24 hours' where room_id=${q(r.room_id)}`);
const denied=rpc(writer,'submit_cadaver_contribution',args(returning));equal(denied.actionError,'C0008','unaccepted send expires without rollback');equal(state(host,r).status,'expired','state terminal');equal(sql(`select count(*) from public.player_active_room_slots where room_id=${q(r.room_id)}`),'0','expiry releases slots');
// Lobby host departure transfers, last host departure does not block creation elsewhere.
r=room();join(second,r);rpc(host,'leave_cadaver_room',{target_room_id:r.room_id});equal(rpc(host,'leave_cadaver_room',{target_room_id:r.room_id}).left,true,'lobby leave retry');check(state(second,r).isHost,'lobby successor');rpc(second,'leave_cadaver_room',{target_room_id:r.room_id});
const another=room(second);check(!!another,'empty old room host can create anew');rpc(second,'cancel_cadaver_room',{target_room_id:another.room_id});
// Sweeper is direct-testable, idempotent and correctly scheduled.
sql(`update cadaver_private.rooms set last_activity_at=clock_timestamp()-interval '25 hours' where room_id=${q(r.room_id)}`);sql('select cadaver_private.sweep_expired()');equal(sql('select cadaver_private.sweep_expired()'),'0','repeated sweep no work');
equal(sql("select count(*) from cron.job where jobname='cadaver-expire-rooms' and schedule='*/15 * * * *' and command='select cadaver_private.sweep_expired()' and active"),'1','cron scheduled');
equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='cadaver_signals'"),'2','signal only routing/version');
equal(sql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='cadaver_signals'"),'1','published signal');
// All terminal and membership races serialize on the same Room row.
async function race(left,right){return Promise.all([left(),right()]);}
for(let i=0;i<3;i++){
 r=room();join(second,r);st=start(host,r);const writer=find(st),sending=args(st);
 const outcomes=await race(()=>concurrent(writer,'submit_cadaver_contribution',sending),()=>concurrent(host,'cancel_cadaver_room',{target_room_id:r.room_id}));
 check(outcomes.every(o=>o.ok),'send/cancel race returns consistent results');
 equal(state(host,r).status,'cancelled','nonfinal send/cancel ends cancelled');
 equal(sql(`select count(*) from cadaver_private.contributions where session_id=${q(st.sessionId)}`),'0','racing cancel clears texts');
}
// Abandon/send either commits the contribution first or rejects after the slot is released.
r=room();join(second,r);st=start(host,r);const leaving=find(st),sending=args(st);
const leaveRace=await race(()=>concurrent(leaving,'submit_cadaver_contribution',sending),()=>concurrent(leaving,'leave_cadaver_room',{target_room_id:r.room_id}));
check(leaveRace[1].ok,'leave serialized');
const afterLeave=state(host,r);check(afterLeave.turn===1||afterLeave.turn===2,'leave never skips more than committed send');
equal(sql(`select count(*) from public.player_active_room_slots where player_id=${q(leaving.player)}`),'0','race leave releases slot');
// Make every author absent, then return concurrently: host election is atomic.
for(const person of [host,second].filter(p=>p.player!==leaving.player))rpc(person,'leave_cadaver_room',{target_room_id:r.room_id});
const returns=await race(()=>concurrent(host,'return_cadaver_room',{target_room_id:r.room_id}),()=>concurrent(second,'return_cadaver_room',{target_room_id:r.room_id}));
check(returns.every(o=>o.ok),'both returns acquire slots');
check(state(host,r).isHost!==state(second,r).isHost,'one active host after concurrent returns');
const successor=state(host,r).isHost?host:second;rpc(successor,'cancel_cadaver_room',{target_room_id:r.room_id});
// Sweeps skip busy Rooms and a state read still enforces the exact deadline.
r=room();join(second,r);st=start(host,r);sql(`update cadaver_private.rooms set last_activity_at=clock_timestamp()-interval '24 hours' where room_id=${q(r.room_id)}`);
const sweep=()=>run('psql',[db,'-XqAt','-v','ON_ERROR_STOP=1','-c','select cadaver_private.sweep_expired()']);
await Promise.all([sweep(),sweep(),concurrent(host,'cancel_cadaver_room',{target_room_id:r.room_id}),concurrent(second,'return_cadaver_room',{target_room_id:r.room_id})]);
equal(state(host,r).status,'expired','racing sweeps/cancel/return enforce expiry');
equal(sql(`select count(*) from cadaver_private.contributions where session_id=${q(st.sessionId)}`),'0','expiry retains no operations/content');
// Final contribution/cancel must preserve a published story if final send won.
r=room();join(second,r);st=start(host,r);while(st.turn<6)st=rpc(find(st),'submit_cadaver_contribution',args(st));
const finalArgs=args(st),finalWriter=find(st);
await race(()=>concurrent(finalWriter,'submit_cadaver_contribution',finalArgs),()=>concurrent(host,'cancel_cadaver_room',{target_room_id:r.room_id}));
const finalState=state(host,r);check(['completed','cancelled'].includes(finalState.status),'final race has one terminal reason');
equal(sql(`select count(*) from cadaver_private.contributions where session_id=${q(st.sessionId)}`),finalState.status==='completed'?'6':'0','atomic final publication or deletion');
// Room-scoped membership changes never emit a revision before commit.
r=room();join(second,r);const originalVersion=sql(`select version from public.cadaver_signals where room_id=${q(r.room_id)}`);
sql(`begin;select cadaver_private.signal(${q(r.room_id)});rollback;`);
equal(sql(`select version from public.cadaver_signals where room_id=${q(r.room_id)}`),originalVersion,'rolled-back changes emit no committed revision');
rpc(host,'cancel_cadaver_room',{target_room_id:r.room_id});
// Legacy games still require a member host; exercise shared guards and neutral mirrors.
for(const type of ['tutti_frutti','impostor']){
 const rm=shared(host,'create_room',{requested_game_type:type});
 for(const person of [second,third])shared(person,'join_room_by_code',{room_code:rm.room_join_code,expected_game_type:type});
 check(!!shared(host,'get_my_active_room',{}),`${type} active recovery`);
 if(type==='impostor'){
  sql(`insert into public.group_words(group_id,text,author_player_id) values(${q(gid)},'Palabra sintética',${q(host.player)})`);
  // Shared host succession and private gameplay continue to use the neutral mirror.
  const t=command(host.user,'start_session');sql(t);
  check(sql(`select count(*) from public.room_sessions where room_id=${q(rm.room_id)} and game_type='impostor'`)==='1','Impostor neutral session mirror');
  rejects(host,'close_room',{},'P0015');
  continue;
 }
 sql(command(host.user,'close_room'));
 equal(sql(`select count(*) from public.player_active_room_slots where room_id=${q(rm.room_id)}`),'0',`${type} close releases slots`);
}

console.log(`Cadáver exquisito DB: ${checks} checks passed.`);
