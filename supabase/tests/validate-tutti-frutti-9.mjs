import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { markClientAsPlatformAdmin } from "./platform-admin-test-helpers.mjs";

const status = execFileSync("./node_modules/.bin/supabase", ["status", "-o", "env"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
if (!env.DB_URL || !env.API_URL || !env.PUBLISHABLE_KEY
  || new URL(env.DB_URL).hostname !== "127.0.0.1"
  || new URL(env.API_URL).hostname !== "127.0.0.1") {
  throw new Error("This validator requires the project's local Supabase instance.");
}

function sqlString(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function psql(sql) {
  return execFileSync("psql", [env.DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ": expected " + expected + ", received " + actual);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function client() {
  return createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
}
async function identity() {
  const instance = client();
  const { data, error } = await instance.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in failed.");
  return instance;
}
async function rpc(instance, name, args) {
  const { data, error } = await instance.rpc(name, args);
  if (error) throw error;
  return data;
}
async function rejects(instance, name, args, code) {
  const { error } = await instance.rpc(name, args);
  equal(error?.code, code, name + " must reject with " + code);
}
async function makeGroup(name, owner, members = []) {
  await markClientAsPlatformAdmin(owner, psql, sqlString);
  const group = (await rpc(owner, "create_group_with_admin_player", {
    group_name: name, player_nickname: "Player 1"
  }))[0];
  for (const [index, member] of members.entries()) {
    await rpc(member, "join_group_with_invitation", {
      invitation_code: group.invitation_code, player_nickname: "Player " + (index + 2)
    });
  }
  return group;
}
async function subscribe(clientInstance, playerId, onEvent) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out subscribing to answer invalidations.")), 5000);
    const channel = clientInstance.channel("tutti-frutti-answer-validation:" + playerId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tutti_frutti_answer_signals",
        filter: "player_id=eq." + playerId
      }, onEvent)
      .subscribe((state, error) => {
        if (state === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve(channel);
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(error ?? new Error("Could not subscribe to private answer invalidations."));
        }
      });
  });
}

for (const table of ["tutti_frutti_answers", "tutti_frutti_answer_signals"]) {
  equal(psql("select relrowsecurity from pg_class where oid='public." + table + "'::regclass"), "t", table + " RLS is enabled");
}
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answers','SELECT,INSERT,UPDATE,DELETE')"), "f", "answer rows have no direct client access");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answer_signals','SELECT')"), "t", "authenticated can read RLS-filtered invalidation signals");
equal(psql("select has_table_privilege('authenticated','public.tutti_frutti_answer_signals','INSERT,UPDATE,DELETE')"), "f", "clients cannot write invalidation signals");
equal(psql("select has_function_privilege('authenticated','public.get_tutti_frutti_my_answers(uuid)','EXECUTE')"), "t", "authenticated can read own answers through RPC");
equal(psql("select has_function_privilege('authenticated','public.save_tutti_frutti_answer(uuid,integer,text)','EXECUTE')"), "t", "authenticated can save own answer through RPC");
equal(psql("select has_function_privilege('authenticated','public.normalize_tutti_frutti_answer_v1(text)','EXECUTE')"), "f", "normalization helper is not an exposed client RPC");

const host = await identity();
const member = await identity();
const outsider = await identity();
const impostorOwner = await identity();
const suffix = randomUUID().slice(0, 8);
let realtimeChannel;
try {
  await makeGroup("Tutti Answers 9 " + suffix, host, [member]);
  const room = (await rpc(host, "create_room", { requested_game_type: "tutti_frutti" }))[0];
  await rpc(member, "join_room_by_code", { room_code: room.room_join_code, expected_game_type: "tutti_frutti" });
  const started = await rpc(host, "start_tutti_frutti_session", { target_room_id: room.room_id });
  equal(psql("select answer_normalization_version::text from public.tutti_frutti_sessions where id="
    + sqlString(started.sessionId) + "::uuid"), "1", "a new session freezes normalization version 1");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "No antes de la letra"
  }, "P0042");

  psql("update public.tutti_frutti_letter_candidates set status='accepted' where session_id="
    + sqlString(started.sessionId) + "::uuid and status='pending'");
  psql("update public.tutti_frutti_rounds set phase='PLAYING' where session_id="
    + sqlString(started.sessionId) + "::uuid and round_number=1");

  const empty = await rpc(host, "get_tutti_frutti_my_answers", { target_room_id: room.room_id });
  equal(empty.phase, "PLAYING", "private read returns the current editable phase");
  equal(empty.normalizationVersion, 1, "private read identifies the session's normalization version");
  equal(empty.answers.length, 5, "private read includes every snapshotted category");
  assert(empty.answers.every((answer) => answer.answerText === "" && answer.updatedAt === null), "unanswered categories are returned as empty drafts");

  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 6, target_answer_text: "Fuera del snapshot"
  }, "P0043");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "x".repeat(201)
  }, "P0041");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: null
  }, "P0041");

  const combining = "e\u0301".repeat(200);
  equal(Array.from(combining.normalize("NFC")).length, 200, "client codepoint count follows NFC");
  const accented = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "  CAFÉ  "
  });
  equal(accented.answerText, "  CAFÉ  ", "save RPC returns the persisted original text");
  equal(psql("select normalized_value from public.tutti_frutti_answers where session_id="
    + sqlString(started.sessionId) + "::uuid and player_id=(select id from public.players where auth_user_id="
    + sqlString((await host.auth.getUser()).data.user.id) + "::uuid) and category_position=1"), "café", "normalization trims edges, case-folds and preserves accents");

  const composed = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 2, target_answer_text: "CAFÉ"
  });
  equal(psql("select normalized_value from public.tutti_frutti_answers where session_id="
    + sqlString(started.sessionId) + "::uuid and category_position=2"), "café", "precomposed accents normalize to NFC");
  const noAccent = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 3, target_answer_text: "CAFE"
  });
  equal(psql("select normalized_value from public.tutti_frutti_answers where session_id="
    + sqlString(started.sessionId) + "::uuid and category_position=3"), "cafe", "accented and unaccented values remain distinct");
  const internalSpace = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 4, target_answer_text: "dos  palabras"
  });
  equal(psql("select normalized_value from public.tutti_frutti_answers where session_id="
    + sqlString(started.sessionId) + "::uuid and category_position=4"), "dos  palabras", "internal whitespace is preserved");
  equal(composed.categoryPosition, 2, "save response identifies its category");
  equal(noAccent.categoryPosition, 3, "save response identifies its category");
  equal(internalSpace.categoryPosition, 4, "save response identifies its category");

  const exactly200 = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 5, target_answer_text: "🙂".repeat(200)
  });
  equal(Array.from(exactly200.answerText).length, 200, "200 astral codepoints are accepted despite 400 UTF-16 units");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 5, target_answer_text: "🙂".repeat(201)
  }, "P0041");

  const cleared = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: " \t\u00a0 "
  });
  equal(cleared.answerText, "", "Unicode whitespace-only input clears the stored answer");
  equal(psql("select original_text || ':' || normalized_value from public.tutti_frutti_answers where session_id="
    + sqlString(started.sessionId) + "::uuid and category_position=1"), ":", "cleared answers persist empty text and normalization");

  const memberAnswer = await rpc(member, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Respuesta privada de Beto"
  });
  const hostRead = await rpc(host, "get_tutti_frutti_my_answers", { target_room_id: room.room_id });
  assert(!JSON.stringify(hostRead).includes(memberAnswer.answerText), "host read model never contains another participant's answer");
  const memberRead = await rpc(member, "get_tutti_frutti_my_answers", { target_room_id: room.room_id });
  equal(memberRead.answers[0].answerText, memberAnswer.answerText, "each participant can recover their own answer");
  const { error: directReadError } = await host.from("tutti_frutti_answers").select("original_text");
  equal(directReadError?.code, "42501", "answer rows reject direct table reads");
  await makeGroup("Tutti Answers Outsider " + suffix, outsider);
  await rejects(outsider, "get_tutti_frutti_my_answers", { target_room_id: room.room_id }, "P0032");
  await rejects(outsider, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Intrusión"
  }, "P0032");
  const { data: outsiderSignals, error: signalReadError } = await outsider
    .from("tutti_frutti_answer_signals").select("session_id,player_id,revision").eq("session_id", started.sessionId);
  assert(!signalReadError, "RLS-filtered signal read remains a valid operation");
  equal(outsiderSignals.length, 0, "another player cannot read the owner's invalidation signal");

  await markClientAsPlatformAdmin(impostorOwner, psql, sqlString);
  const impostorGroup = (await rpc(impostorOwner, "create_group_with_admin_player", {
    group_name: "Impostor answers fixture " + suffix, player_nickname: "Impostor"
  }))[0];
  assert(impostorGroup.invitation_code, "cross-game fixture has a separate group");
  const impostorRoom = (await rpc(impostorOwner, "create_room", {}))[0];
  await rejects(host, "get_tutti_frutti_my_answers", { target_room_id: impostorRoom.room_id }, "P0032");

  const round2 = psql("insert into public.tutti_frutti_rounds(id,session_id,round_number,phase) values (extensions.gen_random_uuid(),"
    + sqlString(started.sessionId) + "::uuid,2,'PLAYING') returning id");
  assert(round2, "second-round fixture was inserted");
  const round2Answer = await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Nueva ronda"
  });
  equal(round2Answer.roundNumber, 2, "writes derive the latest active round from the server");
  equal(psql("select count(*) from public.tutti_frutti_answers where session_id=" + sqlString(started.sessionId) + "::uuid and player_id=(select id from public.players where auth_user_id="
    + sqlString((await host.auth.getUser()).data.user.id) + "::uuid) and category_position=1"), "2", "round history keeps the previous answer row");
  psql("update public.tutti_frutti_rounds set phase='LOCKED' where id=" + sqlString(round2) + "::uuid");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "No después del lock"
  }, "P0042");
  psql("update public.tutti_frutti_rounds set phase='LETTER_PENDING' where id=" + sqlString(round2) + "::uuid");
  await rejects(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 1, target_answer_text: "No antes de letra"
  }, "P0042");
  psql("update public.tutti_frutti_rounds set phase='PLAYING' where id=" + sqlString(round2) + "::uuid");

  const concurrent = await Promise.all([
    rpc(host, "save_tutti_frutti_answer", {
      target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Concurrente A"
    }),
    rpc(host, "save_tutti_frutti_answer", {
      target_room_id: room.room_id, target_category_position: 1, target_answer_text: "Concurrente B"
    })
  ]);
  const persisted = psql("select original_text || '|' || ((extract(epoch from updated_at) * 1000000)::bigint)::text from public.tutti_frutti_answers where round_id="
    + sqlString(round2) + "::uuid and category_position=1 and player_id=(select id from public.players where auth_user_id="
    + sqlString((await host.auth.getUser()).data.user.id) + "::uuid)");
  const [persistedText, persistedTime] = persisted.split("|");
  const toMicros = (timestamp) => {
    const milliseconds = BigInt(Date.parse(timestamp));
    const fraction = timestamp.match(/\.(\d+)(?:Z|[+-])/i)?.[1] ?? "";
    const extraMicros = BigInt((fraction.padEnd(6, "0").slice(3, 6)) || "0");
    return milliseconds * 1000n + extraMicros;
  };
  const winner = concurrent.reduce((latest, current) => toMicros(current.updatedAt) > toMicros(latest.updatedAt) ? current : latest);
  equal(persistedText, winner.answerText, "concurrent RPC responses identify the last committed value");
  equal(persistedTime, String(toMicros(winner.updatedAt)), "last committed response matches the persisted timestamp");

  let invalidation;
  const hostAuthId = (await host.auth.getUser()).data.user.id;
  const hostPlayerId = psql("select id::text from public.players where auth_user_id=" + sqlString(hostAuthId) + "::uuid");
  assert(hostPlayerId, "host has an internal player identity for the Realtime filter");
  realtimeChannel = await subscribe(host, hostPlayerId, (payload) => { invalidation = payload; });
  await rpc(host, "save_tutti_frutti_answer", {
    target_room_id: room.room_id, target_category_position: 2, target_answer_text: "Realtime invalidation"
  });
  const deadline = Date.now() + 5000;
  while (!invalidation && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert(invalidation, "answer change emits a Realtime invalidation");
  const signalPayload = invalidation.new ?? {};
  assert(!Object.keys(signalPayload).some((key) => /answer|text|value/i.test(key)), "invalidation payload contains no answer text or answer fields");
  assert(signalPayload.session_id === started.sessionId, "invalidation is scoped to the session");

  await realtimeChannel.unsubscribe();
  await Promise.all([host, member, outsider, impostorOwner].map((instance) => instance.realtime.disconnect()));
} catch (error) {
  if (realtimeChannel) await realtimeChannel.unsubscribe();
  await Promise.all([host, member, outsider, impostorOwner].map((instance) => instance.realtime.disconnect()));
  throw error;
}

console.log("PASS: Tutti Frutti Increment 9 private answers, normalization, limits, phase guards, history, concurrency and Realtime invalidation.");
