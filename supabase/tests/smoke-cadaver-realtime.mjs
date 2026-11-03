import {RealtimeClient} from '@supabase/realtime-js';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHmac} from 'node:crypto';
const db=process.env.CADAVER_TEST_DB_URL;
if(!db||new URL(db).hostname!=='127.0.0.1'||new URL(db).port!=='55433')throw Error('Expected disposable DB');
const endpoint=process.env.CADAVER_REALTIME_URL || 'ws://127.0.0.1:55436/realtime/v1';
if(new URL(endpoint).hostname!=='127.0.0.1')throw Error('Loopback required');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const sql=t=>execFileSync('psql',[db,'-XqAt','-v','ON_ERROR_STOP=1','-c',t],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=='cadaver-disposable-test')throw Error('marker');
const people=Array.from({length:3},()=>({user:randomUUID(),player:randomUUID()})),gid=randomUUID();
sql('begin;'+people.map((p,i)=>`insert into auth.users(id) values(${q(p.user)});insert into public.players(id,group_id,auth_user_id,nickname) values(${q(p.player)},${q(gid)},${q(p.user)},'Realtime ${i}');`).join('')+`insert into public.groups(id,name,admin_player_id) values(${q(gid)},'Realtime test',${q(people[0].player)});commit;`);
function rpc(p,fn,args=''){return sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(p.user)};select to_jsonb(x) from public.${fn}(${args}) x;commit;`);}
const room=JSON.parse(rpc(people[0],'create_room',"requested_game_type=>'cadaver_exquisito'"));
rpc(people[1],'join_room_by_code',`room_code=>${q(room.room_join_code)},expected_game_type=>'cadaver_exquisito'`);
function token(p){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),h=enc({alg:'HS256',typ:'JWT'}),b=enc({sub:p.user,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});return h+'.'+b+'.'+createHmac('sha256','cadaver-isolated-test-signing-secret-2026').update(h+'.'+b).digest('base64url');}
const clients=[],events=[[],[],[]],channels=[];
const pause=n=>new Promise(r=>setTimeout(r,n));
try{
 for(const [i,p] of people.entries()){
  const jwt=token(p),client=new RealtimeClient(endpoint,{params:{apikey:jwt},accessToken:async()=>jwt});clients.push(client);
  const channel=client.channel('cadaver-test-'+i).on('system',{},message=>{if(message.status==='error')console.error('Realtime system:',message.message);}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'cadaver_signals',filter:`room_id=eq.${room.room_id}`},payload=>events[i].push(payload));channels.push(channel);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('subscription timeout')),20000);channel.subscribe((status,error)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(error??Error('channel error'));}});});
 }
 const signal=()=>sql(`select cadaver_private.signal(${q(room.room_id)})`);
 await pause(2000);signal();for(let i=0;i<50&&events[1].length===0;i++)await pause(200);
 if(!events[0].length||!events[1].length||events[2].length)throw Error('RLS initial delivery mismatch '+events.map(e=>e.length));
 for(const list of events)for(const event of list)if(Object.keys(event.new).sort().join(',')!=='room_id,version')throw Error('Signal content leakage');
 rpc(people[1],'leave_cadaver_room',`target_room_id=>${q(room.room_id)}`);
 await pause(1000);const before=events[1].length,hostBefore=events[0].length;
 signal();for(let i=0;i<30&&events[0].length===hostBefore;i++)await pause(200);await pause(1000);
 if(events[1].length!==before||events[0].length===hostBefore)throw Error('RLS failed to revoke departed client');
 rpc(people[1],'return_cadaver_room',`target_room_id=>${q(room.room_id)}`);
 signal();for(let i=0;i<30&&events[1].length===before;i++)await pause(200);
 if(events[1].length===before)throw Error('Return did not restore delivery');
 console.log('PASS real Postgres Changes: occupant delivery, content-free payload, code-known nonparticipant exclusion, leave revocation on existing subscription, return restoration.');
}finally{for(const client of clients)await client.removeAllChannels();}
