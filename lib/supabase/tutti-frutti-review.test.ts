import { describe, expect, it, vi } from "vitest";
import { getTuttiFruttiReview, openTuttiFruttiChallenge, subscribeToTuttiFruttiReviewInvalidations,
  voteTuttiFruttiChallenge, type TuttiFruttiReviewClient } from "./tutti-frutti-review";

const review = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "REVIEWING", serverNow: "2026-09-25T12:00:00Z", activeChallenge: null,
  categories: [{ position: 1, label: "Nombre", entries: [
    { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false,
      duplicateGroupId: 2, duplicateCount: 2, canChallenge: false, challengeStatus: null },
    { playerId: "b", nickname: "Beto", answerText: "mono", isEmpty: false,
      duplicateGroupId: 2, duplicateCount: 2, canChallenge: true, challengeStatus: null }
  ] }]
};

describe("Tutti Frutti review adapter", () => {
  it("reads the gated review with only a room intent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: review, error: null });
    const client = { rpc, channel: vi.fn() } as unknown as TuttiFruttiReviewClient;
    await expect(getTuttiFruttiReview(client, "room-1")).resolves.toEqual(review);
    expect(rpc).toHaveBeenCalledWith("get_tutti_frutti_review", { target_room_id: "room-1" });
  });

  it("rejects malformed groups and does not expose raw database errors", async () => {
    const invalid = { ...review, categories: [{ ...review.categories[0], entries: [
      { ...review.categories[0].entries[0], duplicateCount: 1 }
    ] }] };
    await expect(getTuttiFruttiReview({ rpc: vi.fn().mockResolvedValue({ data: invalid, error: null }), channel: vi.fn() } as unknown as TuttiFruttiReviewClient, "room-1"))
      .rejects.toThrow("reconstruir");
    await expect(getTuttiFruttiReview({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0042", message: "raw" } }), channel: vi.fn() } as unknown as TuttiFruttiReviewClient, "room-1"))
      .rejects.toMatchObject({ message: "La revisión todavía no está disponible.", code: "P0042" });
  });

  it("sends challenge intents and choices through narrow RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { accepted: true }, error: null });
    const client = { rpc } as unknown as TuttiFruttiReviewClient;
    await openTuttiFruttiChallenge(client, "room-1", "answer-player", 2);
    await voteTuttiFruttiChallenge(client, "room-1", "challenge-1", "INVALID");
    expect(rpc).toHaveBeenNthCalledWith(1, "open_tutti_frutti_challenge", {
      target_room_id: "room-1", target_answer_player_id: "answer-player", target_category_position: 2
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "vote_tutti_frutti_challenge", {
      target_room_id: "room-1", target_challenge_id: "challenge-1", target_choice: "INVALID"
    });
  });

  it("subscribes only to roster review invalidations and ignores payload data", () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn().mockReturnThis();
    const on = vi.fn().mockReturnThis();
    const client = ({ channel: vi.fn().mockReturnValue({ on, subscribe, unsubscribe }) } as unknown as TuttiFruttiReviewClient);
    const invalidated = vi.fn();
    subscribeToTuttiFruttiReviewInvalidations(client, "session-1", invalidated);
    expect(client.channel).toHaveBeenCalledWith("tutti-frutti-review-signals:session-1");
    expect(on).toHaveBeenCalledWith("postgres_changes", {
      event: "*", schema: "public", table: "tutti_frutti_review_signals", filter: "session_id=eq.session-1"
    }, expect.any(Function));
    (on.mock.calls[0][2] as () => void)();
    expect(invalidated).toHaveBeenCalledOnce();
  });
});
