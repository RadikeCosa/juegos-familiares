import { readFileSync } from "node:fs";
const file=process.argv[2];
if(!file) throw new Error("Usage: node supabase/scripts/dictionary-catalog-sql.mjs <catalog.json>");
const rows=JSON.parse(readFileSync(file,"utf8"));
if(!Array.isArray(rows)||!rows.length)throw new Error("Expected a non-empty catalogue array");
const q=value=>value==null?"null":"'"+String(value).replaceAll("'","''")+"'";
const seen=new Set();
const values=rows.map(r=>{
 if(!r.word?.trim()||!r.sense?.trim()||!r.definition?.trim()||!r.verification_reference?.trim()
 ||!["draft","reviewed"].includes(r.status)||!["easy","medium","hard"].includes(r.difficulty))throw new Error("Invalid catalogue entry");
 const key=r.word.normalize("NFC").trim().toLocaleLowerCase("es");
 if(seen.has(key))throw new Error(`Duplicate word: ${key}`);seen.add(key);
 if(r.status==="reviewed"&&(r.verification_status!=="verified"||!r.reviewed_by?.trim()||!Number.isFinite(Date.parse(r.reviewed_at))))throw new Error(`Human review evidence missing: ${key}`);
 return `(${q(r.word.trim())},${q(r.sense)},dictionary_private.normalize_definition(${q(r.definition)}),${q(r.difficulty)},${q(r.verification_reference)},${q(r.status)},${q(r.reviewed_by)},${q(r.reviewed_at)})`;
});
process.stdout.write("-- Generated for review; execute only through an authorized migration.\ninsert into dictionary_private.cards(word,sense,definition,difficulty,verification_reference,status,reviewed_by,reviewed_at) values\n"+values.join(",\n")+";\n");
