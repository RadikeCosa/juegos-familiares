import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Synthetic signed sessions exercise real PostgREST authorization in a disposable DB.
// This smoke does not replace Supabase Auth/Realtime integration validation.
const url=process.env.DICTIONARY_TEST_DB_URL;
if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('Expected an explicit disposable loopback DB');
if(new URL(url).port!=='55432')throw Error('Wrong isolated DB');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const sql=t=>execFileSync('psql',[url,'-XqAt','-v','ON_ERROR_STOP=1','-c',t],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=='dictionary-disposable-test')throw Error('Missing marker');
const people=Array.from({length:3},(_,i)=>({id:randomUUID(),player:randomUUID(),nickname:['Ana','Beto','Camila'][i]})),gid=randomUUID();
sql('begin;'+people.map(p=>`insert into auth.users(id) values(${q(p.id)});insert into public.players(id,group_id,auth_user_id,nickname) values(${q(p.player)},${q(gid)},${q(p.id)},${q(p.nickname)});`).join('')+`insert into public.groups(id,name,admin_player_id) values(${q(gid)},'Browser dictionary',${q(people[0].player)});select dictionary_private.set_enabled(true);notify pgrst,'reload schema';commit;`);
function token(p){const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),h=b({alg:'HS256',typ:'JWT'}),body=b({sub:p.id,role:'authenticated',aud:'authenticated',iat:now,exp:now+7200});return h+'.'+body+'.'+createHmac('sha256','dictionary-isolated-test-signing-secret-2026').update(h+'.'+body).digest('base64url');}
(async()=>{
 const browser=await chromium.launch({headless:true});const contexts=[],pages=[],errors=[];
 try{
  for(const person of people){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);context.setDefaultTimeout(12000);
   const now=Math.floor(Date.now()/1000),session={access_token:token(person),refresh_token:'isolated-fixture',token_type:'bearer',expires_in:7200,expires_at:now+7200,user:{id:person.id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'anonymous',providers:['anonymous']},user_metadata:{},is_anonymous:true}};
   await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/'}]);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));pages.push(page);
   await page.goto('http://127.0.0.1:3107/diccionario');await page.waitForLoadState('networkidle');
  }
  const host=pages[0];
  await new Promise(r=>setTimeout(r,2000));console.log('Entry loaded for three isolated sessions.');
  await host.getByRole('button',{name:'Crear sala',exact:true}).click();await host.waitForURL(/\/diccionario\/sala\//);
  const code=decodeURIComponent(host.url().split('/').pop());
  for(const page of pages.slice(1)){await page.getByLabel('Código de sala').fill(code);await page.getByRole('button',{name:'Unirme a una sala',exact:true}).click();await page.waitForURL(/\/diccionario\/sala\//);}
  await host.getByText('Jugadores (3)',{exact:true}).waitFor();
  await host.getByLabel('Cantidad de rondas').selectOption('3');
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  for(const page of pages)await page.getByLabel('Tu definición inventada').waitFor();
  await host.screenshot({path:'/tmp/dictionary-writing-mobile.png',fullPage:true});
  for(let n=1;n<=3;n++){
   for(const [i,page] of pages.entries()){
    await page.getByLabel('Tu definición inventada').fill(`  instrumento   que sirve para inventar ${i+1} `);
    await page.getByRole('button',{name:'Revisar y enviar',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
   }
   for(const page of pages)await page.getByRole('heading',{name:'¿Cuál es la verdadera?',exact:true}).waitFor();
   const orders=await Promise.all(pages.map(page=>page.locator('fieldset label').allTextContents()));
   // Only the own-definition marker differs between participants.
   if(orders.some(o=>JSON.stringify(o.map(t=>t.replace('Tu definición','')))!==JSON.stringify(orders[0].map(t=>t.replace('Tu definición','')))))throw Error('Different option order');
   await pages[1].reload();await pages[1].getByRole('heading',{name:'¿Cuál es la verdadera?',exact:true}).waitFor();

   if(n===1){
    await contexts[2].route('**/rest/v1/**',route=>route.abort());
    await pages[2].locator('main').getByRole('alert').waitFor({timeout:30000});
    await contexts[2].unroute('**/rest/v1/**');
    await pages[2].locator('main').getByRole('alert').waitFor({state:'hidden',timeout:30000});
   }
   if(n===1)await host.screenshot({path:'/tmp/dictionary-voting-mobile.png',fullPage:true});
   for(const page of pages){await page.locator('input[type=radio]:enabled').first().check();await page.getByRole('button',{name:'Confirmar voto',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();}
   if(n<3){for(const page of pages)await page.getByRole('heading',{name:'La verdadera y sus autores',exact:true}).waitFor();await host.getByRole('button',{name:'Siguiente ronda',exact:true}).click();for(const page of pages)await page.getByLabel('Tu definición inventada').waitFor();}
   else for(const page of pages)await page.getByRole('heading',{name:'Resultado de la partida',exact:true}).waitFor();
  }
  for(const page of pages){await page.reload();await page.getByText('Partida completada.',{exact:true}).waitFor();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Horizontal overflow');}
  await host.screenshot({path:'/tmp/dictionary-final-mobile.png',fullPage:true});
  await host.getByRole('button',{name:'Volver al lobby',exact:true}).click();await host.getByRole('heading',{name:'Listos para inventar'}).waitFor();
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();await host.getByLabel('Tu definición inventada').waitFor();
  await host.getByRole('button',{name:'Finalizar partida',exact:true}).click();await host.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
  await host.getByText('No hubo rondas resueltas. La ronda incompleta no se revela ni suma puntos.',{exact:true}).waitFor();
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 3 isolated mobile sessions, create/join/lobby, 3 rounds, fixed option order, reload, API outage/recovery, final result, rematch and early finish; no page errors or mobile overflow. Realtime delivery is not exercised by this isolated API.');
 }catch(e){for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:`/tmp/dictionary-error-${i}.png`,fullPage:true}).catch(()=>{});}throw e;}finally{await browser.close();sql('select dictionary_private.set_enabled(false)');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
