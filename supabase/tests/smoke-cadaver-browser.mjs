import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {randomUUID,createHmac} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=process.env.CADAVER_TEST_DB_URL;
if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)||new URL(url).port!=='55433')throw Error('Expected disposable DB on loopback 55433');
const base=process.env.CADAVER_BROWSER_URL || 'http://127.0.0.1:3118';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Expected loopback browser URL');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const sql=t=>execFileSync('psql',[url,'-XqAt','-v','ON_ERROR_STOP=1','-c',t],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=='cadaver-disposable-test')throw Error('Missing marker');
const realAuth=process.env.CADAVER_REAL_AUTH==='1';
let people=Array.from({length:4},(_,i)=>({user:randomUUID(),player:randomUUID(),nickname:['Ana','Beto','Camila','Lector'][i]})),gid=randomUUID();
if(!realAuth)sql('begin;'+people.map(p=>`insert into auth.users(id) values(${q(p.user)});insert into public.players(id,group_id,auth_user_id,nickname) values(${q(p.player)},${q(gid)},${q(p.user)},${q(p.nickname)});`).join('')+`insert into public.groups(id,name,admin_player_id) values(${q(gid)},'Cadáver browser',${q(people[0].player)});notify pgrst,'reload schema';commit;`);
function token(p){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),body=enc({sub:p.user,role:'authenticated',aud:'authenticated',iat:now,exp:now+7200});return h+'.'+body+'.'+createHmac('sha256','cadaver-isolated-test-signing-secret-2026').update(h+'.'+body).digest('base64url');}
if(realAuth){
 const anon=token({user:randomUUID()});
 const actors=[];
 for(const name of ['Ana','Beto','Camila','Lector']){
  const client=createClient('http://127.0.0.1:55436',anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signInAnonymously();if(error||!data.session)throw Error(error?.message??'Anonymous Auth failed');
  const jar=new Map();const ssr=createServerClient('http://127.0.0.1:55436',anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(item=>jar.set(item.name,item.value))}});
  await ssr.auth.setSession(data.session);await ssr.auth.stopAutoRefresh();
  actors.push({user:data.user.id,nickname:name,client,cookies:[...jar].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',sameSite:'Lax'}))});
 }
 const call=async(person,name,args)=>{const {data,error}=await person.client.rpc(name,args);if(error)throw Error(name+': '+error.message);return data;};
 sql(`insert into public.platform_admins(auth_user_id) values(${q(actors[0].user)})`);
 const group=(await call(actors[0],'create_group_with_admin_player',{group_name:'Cadáver real local smoke',player_nickname:'Ana'}))[0];
 for(const person of actors.slice(1))await call(person,'join_group_with_invitation',{invitation_code:group.invitation_code,player_nickname:person.nickname});
 for(const person of actors)person.player=sql(`select id from public.players where auth_user_id=${q(person.user)}`);
 people=actors;
}
function state(p,code){return JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${q(p.user)};select public.get_cadaver_state(room_code=>${q(code)});commit;`));}
const browser=await chromium.launch({headless:true}),contexts=[],pages=[],errors=[],frames=[];
try{
 for(const person of people){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);context.setDefaultTimeout(20000);
  const now=Math.floor(Date.now()/1000),session={access_token:token(person),refresh_token:'isolated-fixture',token_type:'bearer',expires_in:7200,expires_at:now+7200,user:{id:person.user,aud:'authenticated',role:'authenticated',app_metadata:{provider:'anonymous',providers:['anonymous']},user_metadata:{},is_anonymous:true}};
  await context.addCookies(person.cookies??[{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>socket.on('framereceived',event=>{try{const message=JSON.parse(event.payload.toString());if((Array.isArray(message)?message[3]:message.event)==='postgres_changes'){frames.push(message);if(/palabra[0-9]/.test(JSON.stringify(message)))errors.push('Realtime exposed contribution');}}catch{}}));pages.push(page);await page.goto(base+'/cadaver-exquisito');await page.waitForLoadState('networkidle');
 }
 const host=pages[0];
 if(realAuth){
  await host.goto(base+'/');await host.getByRole('link',{name:'Ir a Cadáver exquisito',exact:true}).waitFor();
  const dimensions=await host.locator('.game-entry__art').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,background:getComputedStyle(node).backgroundColor})));
  if(dimensions.length!==4||dimensions.some(d=>d.width!==dimensions[0].width||d.height!==dimensions[0].height||d.background!==dimensions[0].background))throw Error('Game card illustrations differ in size or background');
  await host.screenshot({path:'/tmp/cadaver-home-mobile.png',fullPage:true});await host.setViewportSize({width:1024,height:900});await host.screenshot({path:'/tmp/cadaver-home-desktop.png',fullPage:true});await host.setViewportSize({width:390,height:844});
  await host.goto(base+'/cadaver-exquisito');
  await host.evaluate(async()=>{await navigator.serviceWorker.ready;});if(!await host.evaluate(()=>!!navigator.serviceWorker.controller))await host.reload();
  if(!await host.evaluate(()=>!!navigator.serviceWorker.controller))throw Error('Production service worker did not control the page');
 }
 await host.getByRole('button',{name:'Crear sala',exact:true}).click();await host.waitForURL(/\/cadaver-exquisito\/sala\//);const code=decodeURIComponent(host.url().split('/').pop());
 for(const page of pages.slice(1,3)){await page.getByLabel('Código de sala').fill(code);await page.getByRole('button',{name:'Unirme o regresar a una sala',exact:true}).click();await page.waitForURL(/\/sala\//);}
 await host.getByRole('listitem').filter({hasText:'Camila'}).waitFor();
 // The final history has 21 contributions (7 rounds x 3 authors).
 await host.getByLabel('Cantidad de rondas').selectOption('7');await host.getByRole('button',{name:'Revisar participantes e iniciar'}).click();await host.getByRole('dialog').getByText('Camila',{exact:false}).waitFor();await host.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
 let snapshot=state(people[0],code),first=true;
 while(snapshot.status==='writing'){
  const i=people.findIndex(p=>p.player===snapshot.writerId),page=pages[i];
  await page.getByLabel('Tu aporte',{exact:true}).waitFor({timeout:35000});
  const text=Array(50).fill(`palabra${snapshot.turn}`).join(' ');
  await page.getByLabel('Tu aporte',{exact:true}).fill(text);
  if(first){
   await page.reload();await page.getByLabel('Tu aporte',{exact:true}).waitFor();if(await page.getByLabel('Tu aporte',{exact:true}).inputValue()!==text)throw Error('Draft not restored');
   await contexts[i].setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('main').getByRole('alert').waitFor();
   if(await page.getByLabel('Tu aporte',{exact:true}).inputValue()!==text)throw Error('Offline draft lost');
   await contexts[i].setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('main').getByRole('alert').waitFor({state:'hidden',timeout:35000});
   const seen=()=>sql(`select last_seen_at from public.room_participants where room_id=${q(snapshot.roomId)} and player_id=${q(people[i].player)}`);
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
   await new Promise(r=>setTimeout(r,500));const hiddenAt=seen();await new Promise(r=>setTimeout(r,31000));if(seen()!==hiddenAt)throw Error('Hidden page sent heartbeat');
   await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
   await page.screenshot({path:'/tmp/cadaver-writing-mobile.png',fullPage:true});
   // Abandon discards the draft and suspends activity; returning keeps the turn.
   await page.getByRole('button',{name:'Abandonar sala',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByRole('heading',{name:'Saliste de la sala'}).waitFor();
   if(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('cadaver-draft:'))))throw Error('Left draft retained');
   await page.goto(base+'/cadaver-exquisito/sala/'+code);await page.getByRole('button',{name:'Regresar a la sala',exact:true}).click();await page.getByLabel('Tu aporte',{exact:true}).waitFor();if(await page.getByLabel('Tu aporte',{exact:true}).inputValue()!=='')throw Error('Left draft restored unexpectedly');await page.getByLabel('Tu aporte',{exact:true}).fill(text);first=false;
  }
  await page.getByRole('button',{name:'Revisar y enviar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByLabel('Tu aporte',{exact:true}).waitFor({state:'hidden'});
  snapshot=state(people[0],code);
  await Promise.all(pages.slice(0,3).map(p=>p.evaluate(()=>window.dispatchEvent(new Event('focus')))));
 }
 await host.getByRole('link',{name:'Leer la historia completa'}).waitFor({timeout:35000});await host.getByRole('link',{name:'Leer la historia completa'}).click();await host.locator('ol li').last().waitFor();
 if(await host.locator('ol li').count()!==21)throw Error('Wrong story length');
 await host.screenshot({path:'/tmp/cadaver-story-mobile.png',fullPage:true});
 await pages[3].goto(base+'/cadaver-exquisito/historial');await pages[3].getByRole('link',{name:/Historia del/}).first().click();await pages[3].waitForURL(/\/historia\//);await pages[3].locator('ol li').last().waitFor();if(await pages[3].locator('ol li').count()!==21)throw Error('Group reader cannot read');
 for(const page of pages){if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');}
 if(!frames.length)throw Error('UI received no real Realtime invalidation');
 if(realAuth){const cached=await host.evaluate(async()=>{const items=[];for(const name of await caches.keys())for(const request of await (await caches.open(name)).keys())items.push(request.url);return items;});if(!cached.length||cached.some(url=>/rest\/v1|rpc\/|auth\/v1/.test(url)))throw Error('Unsafe or unexercised service worker cache');}
 if(errors.length)throw Error(errors.join('; '));
 console.log('PASS mobile 390px: 3 isolated signed sessions → real PostgREST → disposable DB; 7 rounds, 21 x 50-word contributions, draft reload/discard, abandon/return, final/history and nonparticipant group reader. Actual Realtime invalidations, offline recovery and emulated hidden/foreground lifecycle passed. '+(realAuth?'Real Auth/group onboarding, matching home illustrations and production service worker/static-only cache passed.':'Auth issuance remains a separate check.')+' Physical devices are not tested.');
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`/tmp/cadaver-error-${i}.png`,fullPage:true}).catch(()=>{});throw e;}finally{for(const person of people){if(person.client){await person.client.removeAllChannels();await person.client.auth.stopAutoRefresh();}}await browser.close();}
