// Local-only integration harness. All credentials below are synthetic test fixtures.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
const db='postgresql://postgres:cadaver-local-test@127.0.0.1:55433/postgres';
const secret='cadaver-isolated-test-signing-secret-2026';
const exec=(bin,args,input)=>execFileSync(bin,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const sql=t=>exec('psql',[db,'-XqAt','-v','ON_ERROR_STOP=1','-c',t]);
const marker=()=>{if(sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=='cadaver-disposable-test')throw Error('Refusing: disposable Cadáver database marker missing');};
const token=()=>{const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),h=enc({alg:'HS256',typ:'JWT'}),b=enc({role:'anon',exp:Math.floor(Date.now()/1000)+7200});return h+'.'+b+'.'+createHmac('sha256',secret).update(h+'.'+b).digest('base64url');};
const mode=process.argv[2];
if(mode==='gateway'){
 const server=http.createServer((req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':req.headers['access-control-request-headers']??'*','access-control-allow-methods':'GET,POST,OPTIONS,HEAD'});res.end();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:req.url?.startsWith('/auth/v1/')?55439:55434,path:(req.url??'/').replace(/^\/(rest|auth)\/v1/,''),method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode??502,{...response.headers,'access-control-allow-origin':'*'});response.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });
 server.on('upgrade',(req,socket,head)=>{
  const upstream=net.connect(55435,'127.0.0.1',()=>{
   upstream.write(`${req.method} ${(req.url??'/').replace(/^\/realtime\/v1/,'/socket')} HTTP/${req.httpVersion}\r\n`);
   for(const [key,value] of Object.entries(req.headers))if(key!=='host')upstream.write(`${key}: ${value}\r\n`);
   upstream.write('host: realtime-dev.localhost\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
  });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
 });
 server.listen(55436,'127.0.0.1',()=>console.log('Disposable REST/Realtime gateway: 127.0.0.1:55436'));
}else if(['dev','build','serve'].includes(mode)){
 marker();
 const child=spawn('./node_modules/.bin/next',mode==='build'?['build','--webpack']:[mode==='serve'?'start':'dev',...(mode==='dev'?['--webpack']:[]),'--port','3118','--hostname','127.0.0.1'],{stdio:'inherit',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55436',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:token()}});
 process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',n=>process.exit(n??0));
}else if(mode==='start'){
 marker();
 sql("alter role authenticator login password 'cadaver-api-local-test';grant anon,authenticated,service_role to authenticator;");
 const projectId=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
 if(!projectId)throw Error('Local project id missing');
 const inspect=name=>JSON.parse(exec('docker',['inspect',name]))[0];
 const run=(name,image,env,extra=[])=>{const args=['run','--pull=never','-d','--name',name,'--label','com.juegos.cadaver-test=true',...extra];for(const [key,value] of Object.entries(env))args.push('-e',`${key}=${value}`);exec('docker',[...args,image]);};
 run('cadaver-v1-test-api',inspect(`supabase_rest_${projectId}`).Config.Image,{PGRST_DB_URI:'postgresql://authenticator:cadaver-api-local-test@127.0.0.1:55433/postgres',PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:'55434',PGRST_SERVER_HOST:'127.0.0.1'},['--network','host']);
 run('cadaver-v1-test-realtime',inspect(`supabase_realtime_${projectId}`).Config.Image,{
  DB_HOST:'cadaver-db',DB_PORT:'5432',DB_USER:'postgres',DB_PASSWORD:'cadaver-local-test',DB_NAME:'postgres',DB_AFTER_CONNECT_QUERY:'SET search_path TO _realtime',
  API_JWT_SECRET:secret,SECRET_KEY_BASE:'cadaver-test-only-secret-key-base-000000000000000000000000000000000000',DB_ENC_KEY:'1234567890123456',APP_NAME:'realtime-dev',SEED_SELF_HOST:'true',RUN_JANITOR:'true',PORT:'4000',REALTIME_IP:'0.0.0.0',SLOT_NAME_SUFFIX:'cadaver_test',METRICS_JWT_SECRET:secret
 },['--link','cadaver-v1-test-db:cadaver-db','-p','127.0.0.1:55435:4000']);
 run('cadaver-v1-test-auth',inspect(`supabase_auth_${projectId}`).Config.Image,{
  GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:55436',GOTRUE_SITE_URL:'http://127.0.0.1:3118',
  GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgresql://postgres:cadaver-local-test@cadaver-db:5432/postgres?search_path=auth',
  GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
  GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_RATE_LIMIT_ANONYMOUS_USERS:'100'
 },['--link','cadaver-v1-test-db:cadaver-db','-p','127.0.0.1:55439:9999']);
 console.log('Disposable Auth, API and Realtime created. Run gateway and build/serve (or dev), then the smoke scripts.');
}else if(mode==='stop'){
 marker();
 for(const name of ['cadaver-v1-test-api','cadaver-v1-test-realtime','cadaver-v1-test-auth']){
  const item=JSON.parse(exec('docker',['inspect',name]))[0];
  if(item.Name!=='/'+name||item.Config.Labels?.['com.juegos.cadaver-test']!=='true')throw Error('Refusing to remove unmarked service');
  exec('docker',['rm','-f',item.Id]);
 }
 console.log('Only marked Cadáver API/Realtime containers removed. Stop the disposable DB separately.');
}else throw Error('Usage: node supabase/scripts/cadaver-test-services.mjs start|gateway|dev|build|serve|stop');
