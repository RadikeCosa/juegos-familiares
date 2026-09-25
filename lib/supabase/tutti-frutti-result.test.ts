import { describe, expect, it, vi } from "vitest";
import { getTuttiFruttiRoundResult, scoreTuttiFruttiRound,
  type TuttiFruttiResultClient } from "./tutti-frutti-result";

const result = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "RESULT", scoredAt: "2026-09-25T12:00:00Z", serverNow: "2026-09-25T12:00:01Z",
  categories: [{ position: 1, label: "Animal", entries: [
    { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false, isValid: true, points: 10 },
    { playerId: "b", nickname: "Beto", answerText: "", isEmpty: true, isValid: false, points: 0 }
  ] }],
  totals: [
    { playerId: "a", nickname: "Ana", roundPoints: 10, totalPoints: 10, rank: 1 },
    { playerId: "b", nickname: "Beto", roundPoints: 0, totalPoints: 0, rank: 2 }
  ]
};

describe("Tutti Frutti result RPC adapter", () => {
  it("reads the current result for a room and validates missing-answer rows", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const client = { rpc } as unknown as TuttiFruttiResultClient;
    await expect(getTuttiFruttiRoundResult(client, "room-1")).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("get_tutti_frutti_round_result", {
      target_room_id: "room-1", target_round_id: null
    });
  });

  it("scores the exact reviewed round using only its identifiers", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const client = { rpc } as unknown as TuttiFruttiResultClient;
    await expect(scoreTuttiFruttiRound(client, "room-1", "round-1")).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("score_tutti_frutti_round", {
      target_room_id: "room-1", target_round_id: "round-1"
    });
  });

  it("rejects malformed point values and maps host/open-challenge errors", async () => {
    const malformed = { ...result, categories: [{ ...result.categories[0], entries: [
      { ...result.categories[0].entries[0], points: 7 }, result.categories[0].entries[1]
    ] }] };
    const client = { rpc: vi.fn().mockResolvedValue({ data: malformed, error: null }) } as unknown as TuttiFruttiResultClient;
    await expect(getTuttiFruttiRoundResult(client, "room-1")).rejects.toThrow("resultado de la ronda");
    const denied = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0049", message: "raw" } }) } as unknown as TuttiFruttiResultClient;
    await expect(scoreTuttiFruttiRound(denied, "room-1", "round-1")).rejects.toMatchObject({
      message: "Hay una impugnación pendiente. Resolvámosla antes de puntuar.", code: "P0049"
    });
  });
});
