import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const name="dictionary-v1-test-db";
const marker="dictionary-disposable-test";
const testUrl="postgresql://postgres:dictionary-local-test@127.0.0.1:55432/postgres";
function exec(binary,args,input){return execFileSync(binary,args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
const command=process.argv[2];
if(!["start","stop","validate"].includes(command))throw new Error("Usage: node supabase/scripts/dictionary-test-db.mjs start|stop|validate");
if(command==="validate") {
 execFileSync(process.execPath,["supabase/tests/validate-dictionary-v1.mjs"],{env:{...process.env,DICTIONARY_TEST_DB_URL:testUrl},stdio:"inherit"});
} else if(command==="stop"){
 const label=exec("docker",["inspect",name,"--format",'{{index .Config.Labels "com.juegos.dictionary-test"}}']);
 if(label!=="true")throw new Error("Refusing to remove an unmarked container");
 exec("docker",["rm","-f",name]);console.log("Disposable Dictionary test DB removed.");
}else{
 const id=readFileSync("supabase/config.toml","utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
 if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error("Local Supabase project id missing");
 const raw=exec("./node_modules/.bin/supabase",["status","-o","env"]);
 const local=Object.fromEntries([...raw.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map(m=>[m[1],m[2]]));
 if(!local.DB_URL||!["127.0.0.1","localhost","[::1]"].includes(new URL(local.DB_URL).hostname))throw new Error("Schema source must be local");
 const image=exec("docker",["inspect",`supabase_db_${id}`,"--format","{{.Config.Image}}"]);
 // No pull, no persistent volume, loopback binding, fixed name: an occupied port/name fails safely.
 exec("docker",["run","--pull=never","--rm","-d","--label","com.juegos.dictionary-test=true","--name",name,"-p","127.0.0.1:55432:5432","-e","POSTGRES_PASSWORD=dictionary-local-test",image,"postgres","-c","listen_addresses=*","-c","shared_preload_libraries=pg_cron,pg_stat_statements,pg_net","-c","cron.database_name=postgres"]);
 for(let attempt=0;;attempt++){
  try{exec("psql",[testUrl,"-XqAt","-c","select 1"]);break;}catch(e){if(attempt>=39)throw e;await new Promise(resolve=>setTimeout(resolve,500));}
 }
 exec("docker",["exec",name,"psql","-U","supabase_admin","-d","postgres","-c","alter role postgres superuser"]);
 const roleNames=exec("psql",[local.DB_URL,"-XAt","-c","select rolname from pg_roles where rolname !~ '^pg_' and rolname<>'postgres'"]).split("\n");
 const roles=roleNames.map(role=>`do $$ begin create role "${role.replaceAll('"','""')}"; exception when duplicate_object then null; end $$;`).join("\n");
 const dump=exec("pg_dump",[local.DB_URL,"--schema-only","--clean","--if-exists","--no-owner"]);
 exec("psql",[testUrl,"-Xq","-v","ON_ERROR_STOP=1"],roles+"\ngrant anon,authenticated,service_role to authenticator;\n"+dump+`\ncomment on database postgres is '${marker}';`);
 console.log("Disposable test DB ready. Source rows were not copied.");
 console.log("Run npm run test:db:dictionary, then stop this disposable environment explicitly.");
}
