import { describe, expect, it, vi } from "vitest";
import {
  getTuttiFruttiGameState,
  startTuttiFruttiSession,
  TUTTI_FRUTTI_START_ERROR_MESSAGES,
  type TuttiFruttiGameClient,
  type TuttiFruttiStartedGame
} from "./tutti-frutti-game";

const game: TuttiFruttiStartedGame = {
  roomId: "room-1",
  roomStatus: "playing",
  sessionId: "session-1",
  startedByPlayerId: "host",
  roundCount: 5,
  categories: [{ position: 1, kind: "preset", key: "name", label: "Nombre" }],
  participants: [{ playerId: "host", nickname: "Ana" }],
  round: { number: 1, phase: "LETTER_PENDING", letter: "M" }
};

describe("Tutti Frutti game RPC adapter", () => {
  it("starts through the dedicated RPC and returns the server snapshot", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: game, error: null });
    const client = { rpc } as unknown as TuttiFruttiGameClient;
    await expect(startTuttiFruttiSession(client, "room-1")).resolves.toEqual(game);
    expect(rpc).toHaveBeenCalledWith("start_tutti_frutti_session", { target_room_id: "room-1" });
  });

  it("reconstructs state with the authorized read RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: game, error: null });
    const client = { rpc } as unknown as TuttiFruttiGameClient;
    await expect(getTuttiFruttiGameState(client, "room-1")).resolves.toEqual(game);
    expect(rpc).toHaveBeenCalledWith("get_tutti_frutti_game_state", { target_room_id: "room-1" });
  });

  it("maps stable SQLSTATEs and hides unknown database messages", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0037", message: "raw" } })
    } as unknown as TuttiFruttiGameClient;
    await expect(startTuttiFruttiSession(client, "room-1")).rejects.toMatchObject({
      message: TUTTI_FRUTTI_START_ERROR_MESSAGES.P0037,
      code: "P0037"
    });
  });

  it("rejects an incomplete or malformed state response", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { ...game, round: { ...game.round, letter: "Ñ" } }, error: null })
    } as unknown as TuttiFruttiGameClient;
    await expect(getTuttiFruttiGameState(client, "room-1")).rejects.toThrow("No pudimos reconstruir");
  });
});
