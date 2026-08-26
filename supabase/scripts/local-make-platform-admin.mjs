import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeHostname(hostname) {
  return hostname.replace(/^\[(.*)\]$/, "$1");
}

export function parseSupabaseStatusEnv(output) {
  const env = {};

  for (const match of output.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)) {
    env[match[1]] = match[2];
  }

  return env;
}

export function readSupabaseEnv() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return parseSupabaseStatusEnv(output);
}

function requireUrl(value, label) {
  if (!value) {
    throw new Error(`ABORTADO: falta ${label} en Supabase status local.`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`ABORTADO: ${label} no es una URL valida.`);
  }
}

export function assertLocalSupabaseEnv(env) {
  const apiUrl = requireUrl(env.API_URL, "API_URL");
  const dbUrl = requireUrl(env.DB_URL, "DB_URL");

  if (!LOCAL_HOSTS.has(normalizeHostname(apiUrl.hostname))) {
    throw new Error(`ABORTADO: API_URL no es local (${env.API_URL}).`);
  }

  if (!LOCAL_HOSTS.has(normalizeHostname(dbUrl.hostname))) {
    throw new Error(`ABORTADO: DB_URL no es local (${env.DB_URL}).`);
  }
}

export function validateAuthUserId(value) {
  if (!value) {
    throw new Error("Uso: npm run local:make-platform-admin -- <auth-user-id>");
  }

  if (!UUID_PATTERN.test(value)) {
    throw new Error("El auth-user-id debe ser un UUID valido.");
  }

  return value;
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function createPsql(dbUrl) {
  return function psql(sql) {
    return execFileSync("psql", [
      dbUrl,
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      sql
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  };
}

export function makePlatformAdmin(authUserId, psql) {
  const validAuthUserId = validateAuthUserId(authUserId);
  const quotedAuthUserId = `${sqlString(validAuthUserId)}::uuid`;

  const authUserExists = psql(`
    select exists (
      select 1
      from auth.users
      where id = ${quotedAuthUserId}
    );
  `);

  if (authUserExists !== "t") {
    throw new Error(`No existe auth.users.id local para ${validAuthUserId}.`);
  }

  const alreadyEnabled = psql(`
    select exists (
      select 1
      from public.platform_admins
      where auth_user_id = ${quotedAuthUserId}
    );
  `) === "t";

  psql(`
    insert into public.platform_admins (auth_user_id)
    values (${quotedAuthUserId})
    on conflict (auth_user_id) do nothing;
  `);

  return { alreadyEnabled };
}

export function run(argv = process.argv.slice(2), options = {}) {
  if (argv.length !== 1) {
    throw new Error("Uso: npm run local:make-platform-admin -- <auth-user-id>");
  }

  const authUserId = validateAuthUserId(argv[0]);
  const env = options.env ?? readSupabaseEnv();

  assertLocalSupabaseEnv(env);

  const psql = options.psql ?? createPsql(env.DB_URL);
  return makePlatformAdmin(authUserId, psql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const authUserId = process.argv[2];
    const result = run();

    if (result.alreadyEnabled) {
      console.log(`Platform admin local ya estaba habilitado para ${authUserId}`);
    } else {
      console.log(`Platform admin local habilitado para ${authUserId}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
