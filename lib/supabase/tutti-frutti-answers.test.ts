import { describe, expect, it, vi } from "vitest";
import {
  countAnswerCodePoints,
  getTuttiFruttiMyAnswers,
  saveTuttiFruttiAnswer,
  subscribeToTuttiFruttiAnswerInvalidations,
  type TuttiFruttiAnswerClient
} from "./tutti-frutti-answers";

const answerSnapshot = {
  roomId: "room-1",
  sessionId: "session-1",
  roundId: "round-1",
  roundNumber: 1,
  phase: "PLAYING",
  normalizationVersion: 1,
  answers: [{ categoryPosition: 1, answerText: "Mar", updatedAt: "2026-09-24T12:00:00Z" }]
};

describe("Tutti Frutti answer adapter", () => {
  it("counts NFC Unicode code points rather than UTF-16 units", () => {
    expect(countAnswerCodePoints("🙂".repeat(200))).toBe(200);
    expect(countAnswerCodePoints("e\u0301".repeat(200))).toBe(200);
    expect(countAnswerCodePoints("🙂".repeat(201))).toBe(201);
  });

  it("reads only the authenticated player's active-round answer RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: answerSnapshot, error: null });
    const snapshot = await getTuttiFruttiMyAnswers({ rpc } as unknown as TuttiFruttiAnswerClient, "room-1");
    expect(rpc).toHaveBeenCalledWith("get_tutti_frutti_my_answers", { target_room_id: "room-1" });
    expect(snapshot.answers[0]).toMatchObject({ categoryPosition: 1, answerText: "Mar" });
  });

  it("returns the persisted answer value and timestamp from a save", async () => {
    const persisted = {
      roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
      categoryPosition: 2, answerText: "Monte", updatedAt: "2026-09-24T12:00:02Z"
    };
    const rpc = vi.fn().mockResolvedValue({ data: persisted, error: null });
    const saved = await saveTuttiFruttiAnswer({ rpc } as unknown as TuttiFruttiAnswerClient, "room-1", 2, "Monte");
    expect(rpc).toHaveBeenCalledWith("save_tutti_frutti_answer", {
      target_room_id: "room-1", target_category_position: 2, target_answer_text: "Monte"
    });
    expect(saved).toEqual(persisted);
  });

  it("translates stable SQLSTATEs without exposing the raw database message", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0042", message: "raw database detail" } });
    await expect(saveTuttiFruttiAnswer({ rpc } as unknown as TuttiFruttiAnswerClient, "room-1", 1, "Mar"))
      .rejects.toMatchObject({ message: "La ronda ya no acepta cambios.", code: "P0042" });
  });

  it("subscribes only to the actor-scoped invalidation table and ignores its payload", () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn().mockReturnThis();
    const on = vi.fn().mockReturnThis();
    const channel = { on, subscribe, unsubscribe };
    const client = {
      channel: vi.fn().mockReturnValue(channel)
    } as unknown as TuttiFruttiAnswerClient;
    const invalidated = vi.fn();
    const subscription = subscribeToTuttiFruttiAnswerInvalidations(client, "player-1", invalidated);
    expect(client.channel).toHaveBeenCalledWith("tutti-frutti-answer-signals:player-1");
    expect(on).toHaveBeenCalledWith("postgres_changes", {
      event: "*", schema: "public", table: "tutti_frutti_answer_signals", filter: "player_id=eq.player-1"
    }, expect.any(Function));
    const callback = on.mock.calls[0][2] as () => void;
    callback();
    expect(invalidated).toHaveBeenCalledOnce();
    expect(subscription.unsubscribe()).resolves.toBeUndefined();
  });
});
