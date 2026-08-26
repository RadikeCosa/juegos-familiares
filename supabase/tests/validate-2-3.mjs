import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

function readSupabaseEnv() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const env = {};

  for (const match of output.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)) {
    env[match[1]] = match[2];
  }

  for (const key of ["API_URL", "PUBLISHABLE_KEY", "DB_URL"]) {
    if (!env[key]) {
      throw new Error(`Missing ${key} from local Supabase status.`);
    }
  }

  return env;
}

const supabaseEnv = readSupabaseEnv();

function createAnonymousClient() {
  return createClient(supabaseEnv.API_URL, supabaseEnv.PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

function psql(sql) {
  return execFileSync("psql", [
    supabaseEnv.DB_URL,
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
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}

async function signInAnonymously(label) {
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.user) {
    throw new Error(`${label}: anonymous sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

function singleRow(data, message) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function createGroup(client, groupName, playerNickname) {
  await markClientAsPlatformAdmin(client, psql, sqlString);

  const { data, error } = await client.rpc("create_group_with_admin_player", {
    group_name: groupName,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Create group RPC returned no row.");
}

async function resolveInvitation(client, invitationCode) {
  const { data, error } = await client.rpc("resolve_group_invitation", {
    invitation_code: invitationCode
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Resolve invitation RPC returned no row.");
}

async function joinGroup(client, invitationCode, playerNickname) {
  const { data, error } = await client.rpc("join_group_with_invitation", {
    invitation_code: invitationCode,
    player_nickname: playerNickname
  });

  if (error) {
    throw error;
  }

  return singleRow(data, "Join group RPC returned no row.");
}

async function getMyActiveGroupInvitation(client) {
  const { data, error } = await client.rpc("get_my_active_group_invitation");

  if (error) {
    throw error;
  }

  return singleRow(data, "Get active group invitation RPC returned no row.");
}

async function expectRpcFailure(operation) {
  try {
    const row = await operation();

    throw new Error(`Expected RPC to fail, got ${JSON.stringify(row)}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected RPC")) {
      throw error;
    }
  }
}

async function expectDirectWriteDenied(operation) {
  const { error } = await operation();

  assert(error, "Expected direct table write to be denied.");
}

async function expectDirectSelectDenied(operation) {
  const { data, error } = await operation();

  assert(error || !data || data.length === 0, "Expected direct select to expose no invitations.");
}

function countRows(table) {
  return Number(psql(`select count(*) from public.${table};`));
}

function countPlayersInGroup(groupId) {
  return Number(psql(`
    select count(*)
    from public.players
    where group_id = ${sqlString(groupId)}::uuid;
  `));
}

function countPlayersForAuthUser(authUserId) {
  return Number(psql(`
    select count(*)
    from public.players
    where auth_user_id = ${sqlString(authUserId)}::uuid;
  `));
}

function countNicknameInGroup(groupId, normalizedNickname) {
  return Number(psql(`
    select count(*)
    from public.players
    where group_id = ${sqlString(groupId)}::uuid
      and nickname_normalized = ${sqlString(normalizedNickname)};
  `));
}

async function readAllGroups(client) {
  const { data, error } = await client.from("groups").select("*").order("created_at");

  if (error) {
    throw error;
  }

  return data;
}

async function readAllPlayers(client) {
  const { data, error } = await client.from("players").select("*").order("created_at");

  if (error) {
    throw error;
  }

  return data;
}

function invitationForCode(code) {
  return psql(`
    select group_id, code, active
    from public.group_invitations
    where code = ${sqlString(code)};
  `).split("|");
}

async function validate() {
  const results = [];

  const startingCounts = {
    groups: countRows("groups"),
    players: countRows("players"),
    invitations: countRows("group_invitations")
  };

  const authA = await signInAnonymously("Auth A");
  const createdA = await createGroup(authA.client, " Familia 2.3 A ", " Ramiro ");
  const groupAId = createdA.group_id;
  const playerAId = createdA.player_id;
  const invitationCodeA = createdA.invitation_code;

  assert(invitationCodeA, "Case A should return an invitation code.");
  assert(/^[A-HJ-NP-Z2-9]{8}$/.test(invitationCodeA), "Case A invitation code format mismatch.");
  assertEqual(countRows("groups"), startingCounts.groups + 1, "Case A group count mismatch.");
  assertEqual(countRows("players"), startingCounts.players + 1, "Case A player count mismatch.");
  assertEqual(countRows("group_invitations"), startingCounts.invitations + 1, "Case A invitation count mismatch.");

  const invitationA = invitationForCode(invitationCodeA);
  assertEqual(invitationA[0], groupAId, "Case A invitation group mismatch.");
  assertEqual(invitationA[1], invitationCodeA, "Case A invitation code mismatch.");
  assertEqual(invitationA[2], "t", "Case A invitation should be active.");
  assertEqual(
    psql(`select admin_player_id from public.groups where id = ${sqlString(groupAId)}::uuid;`),
    playerAId,
    "Case A admin mismatch."
  );
  results.push(["A Group crea invitación", "PASS", "Auth A created Group + admin Player + active invitation."]);

  const activeInvitationForA = await getMyActiveGroupInvitation(authA.client);
  assertEqual(activeInvitationForA.code, invitationCodeA, "Case A2 admin recovered wrong invitation.");
  assertEqual(Object.keys(activeInvitationForA).sort().join(","), "code", "Case A2 returned extra fields.");
  results.push(["A2 admin recupera invitación", "PASS", "Admin recovers only the active invitation code for its own Group."]);

  const authB = await signInAnonymously("Auth B");
  const resolvedByB = await resolveInvitation(authB.client, ` ${invitationCodeA.toLowerCase()} `);

  assertEqual(resolvedByB.group_name, "Familia 2.3 A", "Case B resolved wrong group name.");
  assertEqual(resolvedByB.canonical_code, invitationCodeA, "Case B canonical code mismatch.");
  assertEqual(Object.keys(resolvedByB).sort().join(","), "canonical_code,group_name", "Case B returned extra fields.");

  const groupsBeforeJoinB = await readAllGroups(authB.client);
  const playersBeforeJoinB = await readAllPlayers(authB.client);
  assertEqual(groupsBeforeJoinB.length, 0, "Case B should not read Group A before join.");
  assertEqual(playersBeforeJoinB.length, 0, "Case B should not read Players before join.");
  results.push(["B resolver invitación", "PASS", "Auth B resolves minimal group data but cannot select Group A yet."]);

  const joinedB = await joinGroup(authB.client, invitationCodeA, " Pedro ");
  assertEqual(joinedB.group_name, "Familia 2.3 A", "Case C joined wrong group.");
  assertEqual(joinedB.joined_player_nickname, "Pedro", "Case C nickname should be trimmed.");
  assertEqual(joinedB.is_admin, false, "Case C second player should not be admin.");
  assertEqual(countPlayersForAuthUser(authB.userId), 1, "Case C Auth B player count mismatch.");
  results.push(["C join", "PASS", "Auth B joined Group A through invitation and created one Player."]);

  await expectRpcFailure(() => getMyActiveGroupInvitation(authB.client));
  results.push(["C2 no-admin sin invitación", "PASS", "A non-admin Player in the same Group cannot recover the active invitation."]);

  const groupsVisibleToA = await readAllGroups(authA.client);
  const groupsVisibleToB = await readAllGroups(authB.client);
  const playersVisibleToA = await readAllPlayers(authA.client);
  const playersVisibleToB = await readAllPlayers(authB.client);

  assert(groupsVisibleToA.some((group) => group.id === groupAId), "Case D Auth A cannot read Group A.");
  assertEqual(groupsVisibleToB.length, 1, "Case D Auth B should read exactly one group.");
  assertEqual(groupsVisibleToB[0].id, groupAId, "Case D Auth B saw wrong group.");
  assertEqual(playersVisibleToA.length, 2, "Case D Auth A should read both players in Group A.");
  assertEqual(playersVisibleToB.length, 2, "Case D Auth B should read both players in Group A.");
  results.push(["D mismo Group visible", "PASS", "Auth A and Auth B read the same Group and both Players through RLS."]);

  assertEqual(
    psql(`select admin_player_id from public.groups where id = ${sqlString(groupAId)}::uuid;`),
    playerAId,
    "Case E admin changed after join."
  );
  results.push(["E segundo Player no admin", "PASS", "Group admin remains Player A after Player B joins."]);

  const authC = await signInAnonymously("Auth C");
  await expectRpcFailure(() => resolveInvitation(authC.client, "ZZZZZZZZ"));
  await expectRpcFailure(() => joinGroup(authC.client, "ZZZZZZZZ", "Camila"));
  assertEqual((await readAllGroups(authC.client)).length, 0, "Case F Auth C should not read groups.");
  assertEqual((await readAllPlayers(authC.client)).length, 0, "Case F Auth C should not read players.");
  results.push(["F sin invitación válida", "PASS", "Invalid code cannot resolve, join, or expose group data."]);

  psql(`
    update public.group_invitations
       set active = false
     where code = ${sqlString(invitationCodeA)};
  `);
  const invitationsBeforeInactiveAdminRecovery = countRows("group_invitations");
  await expectRpcFailure(() => getMyActiveGroupInvitation(authA.client));
  assertEqual(
    countRows("group_invitations"),
    invitationsBeforeInactiveAdminRecovery,
    "Case G active invitation recovery should not create invitations."
  );
  const authD = await signInAnonymously("Auth D");
  await expectRpcFailure(() => resolveInvitation(authD.client, invitationCodeA));
  await expectRpcFailure(() => joinGroup(authD.client, invitationCodeA, "Victoria"));
  psql(`
    update public.group_invitations
       set active = true
     where code = ${sqlString(invitationCodeA)};
  `);
  results.push(["G invitación inactiva", "PASS", "Inactive invitation cannot resolve or join."]);

  const playersBeforeDuplicateNicknames = countPlayersInGroup(groupAId);
  for (const duplicateNickname of ["pedro", "PEDRO", " Pedro "]) {
    const duplicateAuth = await signInAnonymously(`Duplicate ${duplicateNickname}`);
    await expectRpcFailure(() => joinGroup(duplicateAuth.client, invitationCodeA, duplicateNickname));
  }
  assertEqual(countPlayersInGroup(groupAId), playersBeforeDuplicateNicknames, "Case H duplicate nickname inserted a player.");
  assertEqual(countNicknameInGroup(groupAId, "pedro"), 1, "Case H normalized duplicate count mismatch.");
  results.push(["H nickname case-insensitive", "PASS", "Duplicate nicknames by trim + lowercase fail inside the group."]);

  const authOtherGroup = await signInAnonymously("Auth other group");
  const createdOtherGroup = await createGroup(authOtherGroup.client, "Familia 2.3 B", "Pedro");
  const groupBId = createdOtherGroup.group_id;
  const invitationCodeB = createdOtherGroup.invitation_code;
  assert(groupBId !== groupAId, "Case I expected another group.");
  assertEqual(countNicknameInGroup(groupBId, "pedro"), 1, "Case I nickname in other group missing.");
  const activeInvitationForOtherGroup = await getMyActiveGroupInvitation(authOtherGroup.client);
  assertEqual(activeInvitationForOtherGroup.code, invitationCodeB, "Case I admin should recover only its own Group invitation.");
  assert(activeInvitationForOtherGroup.code !== invitationCodeA, "Case I other Group admin recovered Group A invitation.");
  results.push(["I mismo nickname otro Group", "PASS", "Same normalized nickname is allowed in another group."]);

  const authDoubleJoin = await signInAnonymously("Auth double join");
  const beforeDoubleJoinPlayers = countPlayersInGroup(groupAId);
  const doubleJoinResults = await Promise.allSettled([
    joinGroup(authDoubleJoin.client, invitationCodeA, "Juan"),
    joinGroup(authDoubleJoin.client, invitationCodeA, "Juan bis")
  ]);
  assertEqual(doubleJoinResults.filter((result) => result.status === "fulfilled").length, 1, "Case J expected one join to succeed.");
  assertEqual(doubleJoinResults.filter((result) => result.status === "rejected").length, 1, "Case J expected one join to fail.");
  assertEqual(countPlayersForAuthUser(authDoubleJoin.userId), 1, "Case J Auth got more than one Player.");
  assertEqual(countPlayersInGroup(groupAId), beforeDoubleJoinPlayers + 1, "Case J player count mismatch.");
  results.push(["J doble join concurrente", "PASS", "Concurrent joins for the same AuthIdentity leave exactly one Player."]);

  const authSameNicknameA = await signInAnonymously("Auth same nickname A");
  const authSameNicknameB = await signInAnonymously("Auth same nickname B");
  const beforeSameNicknamePlayers = countPlayersInGroup(groupAId);
  const sameNicknameResults = await Promise.allSettled([
    joinGroup(authSameNicknameA.client, invitationCodeA, "Julio"),
    joinGroup(authSameNicknameB.client, invitationCodeA, " julio ")
  ]);
  assertEqual(sameNicknameResults.filter((result) => result.status === "fulfilled").length, 1, "Case K expected one nickname join to succeed.");
  assertEqual(sameNicknameResults.filter((result) => result.status === "rejected").length, 1, "Case K expected one nickname join to fail.");
  assertEqual(countNicknameInGroup(groupAId, "julio"), 1, "Case K normalized nickname count mismatch.");
  assertEqual(countPlayersInGroup(groupAId), beforeSameNicknamePlayers + 1, "Case K player count mismatch.");
  results.push(["K nickname concurrente", "PASS", "Concurrent same nickname joins leave one normalized nickname."]);

  const groupsVisibleToBAfterOtherGroup = await readAllGroups(authB.client);
  const playersVisibleToBAfterOtherGroup = await readAllPlayers(authB.client);
  assertEqual(groupsVisibleToBAfterOtherGroup.length, 1, "Case L Auth B should still see one group.");
  assertEqual(groupsVisibleToBAfterOtherGroup[0].id, groupAId, "Case L Auth B saw another group.");
  assert(
    playersVisibleToBAfterOtherGroup.every((player) => player.group_id === groupAId),
    "Case L Auth B saw players from another group."
  );
  results.push(["L aislamiento otros Groups", "PASS", "Auth B remains isolated from Group B and its Players."]);

  await expectDirectSelectDenied(() => authB.client.from("group_invitations").select("*"));
  await expectDirectWriteDenied(() => authB.client.from("group_invitations").insert({
    id: randomUUID(),
    group_id: groupAId,
    code: "ABCDEFGH"
  }));
  await expectDirectWriteDenied(() => authB.client.from("group_invitations").update({ active: false }).eq("code", invitationCodeA));
  await expectDirectWriteDenied(() => authB.client.from("group_invitations").delete().eq("code", invitationCodeA));
  results.push(["M invitaciones no enumerables", "PASS", "Authenticated clients cannot select/write group_invitations directly."]);

  const noAuthClient = createAnonymousClient();
  await expectRpcFailure(() => getMyActiveGroupInvitation(noAuthClient));
  results.push(["M2 invitación requiere Auth", "PASS", "Unauthenticated clients cannot recover active invitations."]);

  const rpcSignatureChecks = psql(`
    select
      to_regprocedure('public.join_group_with_invitation(text,text)') is not null,
      to_regprocedure('public.join_group_with_invitation(text,text,uuid)') is null,
      has_function_privilege('anon', 'public.join_group_with_invitation(text,text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.join_group_with_invitation(text,text)', 'EXECUTE'),
      to_regprocedure('public.get_my_active_group_invitation()') is not null,
      to_regprocedure('public.get_my_active_group_invitation(uuid)') is null,
      to_regprocedure('public.get_my_active_group_invitation(text)') is null,
      has_function_privilege('anon', 'public.get_my_active_group_invitation()', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.get_my_active_group_invitation()', 'EXECUTE');
  `).split("|");
  assertEqual(rpcSignatureChecks[0], "t", "Case N expected join function signature.");
  assertEqual(rpcSignatureChecks[1], "t", "Case N should not expose group_id overload.");
  assertEqual(rpcSignatureChecks[2], "f", "Case N anon should not execute join.");
  assertEqual(rpcSignatureChecks[3], "t", "Case N authenticated should execute join.");
  assertEqual(rpcSignatureChecks[4], "t", "Case N expected active invitation function signature.");
  assertEqual(rpcSignatureChecks[5], "t", "Case N should not expose uuid overload for active invitation.");
  assertEqual(rpcSignatureChecks[6], "t", "Case N should not expose text overload for active invitation.");
  assertEqual(rpcSignatureChecks[7], "f", "Case N anon should not execute active invitation recovery.");
  assertEqual(rpcSignatureChecks[8], "t", "Case N authenticated should execute active invitation recovery.");
  results.push(["N no RPCs arbitrarias", "PASS", "Join and active invitation RPCs do not accept Group/Auth identifiers."]);

  const beforeRollback = {
    groups: countRows("groups"),
    players: countRows("players"),
    invitations: countRows("group_invitations")
  };
  const rollbackAuth = await signInAnonymously("Rollback auth");
  await expectRpcFailure(() => createGroup(rollbackAuth.client, "Grupo rollback", ""));
  await expectRpcFailure(() => joinGroup(rollbackAuth.client, invitationCodeA, "N".repeat(33)));
  assertEqual(countRows("groups"), beforeRollback.groups, "Case O group count changed.");
  assertEqual(countRows("players"), beforeRollback.players, "Case O player count changed.");
  assertEqual(countRows("group_invitations"), beforeRollback.invitations, "Case O invitation count changed.");
  results.push(["O rollback", "PASS", "Invalid create/join leave no partial Group, Player, invitation, or duplicate."]);

  console.table(results.map(([caseName, result, evidence]) => ({
    "Caso": caseName,
    "Resultado": result,
    "Evidencia": evidence
  })));
}

validate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
