export type CadaverParticipant = { playerId: string; nickname: string; isSelf: boolean; isHost: boolean; present: boolean; connected: boolean };
export type CadaverState = {
  roomId: string; code: string; playerId: string; status: "lobby" | "writing" | "completed" | "cancelled" | "expired";
  occupied: boolean; isHost: boolean; roundCount: 3 | 5 | 7; lobbyVersion: string;
  participants: CadaverParticipant[]; sessionId: string | null; turn: number | null; round: number | null;
  writerId: string | null; hint: string | null; expiresAt: string; serverNow: string; closedReason: string | null;
};
export type CadaverStorySummary = { sessionId: string; finishedAt: string; roundCount: number; participants: string[] };
export type CadaverStory = { sessionId: string; finishedAt: string; roundCount: number; contributions: { turn: number; author: string; text: string }[] };
export type CadaverOperation = "get_cadaver_state" | "return_cadaver_room" | "configure_cadaver_room" | "start_cadaver_session" | "submit_cadaver_contribution" | "leave_cadaver_room" | "cancel_cadaver_room" | "heartbeat_cadaver_room" | "list_cadaver_stories" | "get_cadaver_story";
type RpcResult = { data: unknown; error: unknown };
export type CadaverClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> } };
const messages: Record<string, string> = {
  C0001: "Esta sala o historia no está disponible para tu cuenta.",
  C0002: "Este turno ya no está disponible. Actualizá la sala antes de continuar.",
  C0003: "Esta acción corresponde al anfitrión activo.",
  C0004: "Revisá la configuración o escribí entre 3 y 50 palabras.",
  C0005: "Cambió la lista o configuración. Revisala y confirmá de nuevo.",
  C0006: "Se necesitan al menos dos participantes para empezar.",
  C0007: "Este envío ya se usó con otro contenido. Actualizá la sala.",
  C0008: "La sala venció. El aporte no fue aceptado.",
  P0012: "Ya estás en otra sala. Salí de ella antes de regresar.",
  P0029: "Ya tenés una sala activa de otro juego.",
  P0030: "Ese código corresponde a otro juego.",
  P0010: "No encontramos esa sala en tu grupo.",
  "28000": "Entrá a tu grupo para jugar."
};
export function cadaverError(value: unknown): Error {
  const code = value && typeof value === "object" && "code" in value ? String(value.code) : "";
  return new Error(messages[code] ?? "No pudimos confirmar la acción. Podés reintentar el mismo envío.");
}
export async function cadaverRpc(client: CadaverClient, operation: CadaverOperation, args: Record<string, unknown> = {}): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const query = client.rpc(operation, args);
    const { data, error } = await (query.abortSignal ? query.abortSignal(controller.signal) : query);
    if (error) throw cadaverError(error);
    return data;
  } finally { clearTimeout(timer); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export function parseCadaverState(value: unknown): CadaverState {
  if (!record(value) || typeof value.roomId !== "string" || typeof value.code !== "string" || typeof value.playerId !== "string"
    || !["lobby", "writing", "completed", "cancelled", "expired"].includes(String(value.status))
    || typeof value.occupied !== "boolean" || typeof value.isHost !== "boolean" || ![3,5,7].includes(Number(value.roundCount))
    || typeof value.lobbyVersion !== "string" || !date(value.expiresAt) || !date(value.serverNow)
    || !Array.isArray(value.participants) || !value.participants.every(p => record(p) && typeof p.playerId === "string" && typeof p.nickname === "string"
      && ["isSelf","isHost","present","connected"].every(k => typeof p[k] === "boolean"))
    || !(value.hint === null || typeof value.hint === "string") || !(value.sessionId === null || typeof value.sessionId === "string")
    || (value.status === "writing" && (!Number.isInteger(value.turn) || Number(value.turn)<1 || !Number.isInteger(value.round) || typeof value.writerId !== "string")))
    throw new Error("No pudimos reconstruir la sala.");
  return value as CadaverState;
}
export function parseCadaverStory(value: unknown): CadaverStory {
  if (!record(value) || typeof value.sessionId !== "string" || !date(value.finishedAt) || ![3,5,7].includes(Number(value.roundCount))
    || !Array.isArray(value.contributions) || !value.contributions.every((c,i) => record(c) && c.turn===i+1 && typeof c.author === "string" && typeof c.text === "string"))
    throw new Error("No pudimos recuperar la historia.");
  return value as CadaverStory;
}
export function parseCadaverHistory(value: unknown): CadaverStorySummary[] {
  if (!Array.isArray(value) || !value.every(s => record(s) && typeof s.sessionId === "string" && date(s.finishedAt) && [3,5,7].includes(Number(s.roundCount))
    && Array.isArray(s.participants) && s.participants.every(p => typeof p === "string"))) throw new Error("No pudimos recuperar el historial.");
  return value as CadaverStorySummary[];
}
