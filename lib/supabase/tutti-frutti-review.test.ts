import { describe, expect, it, vi } from "vitest";
import { getTuttiFruttiReview, type TuttiFruttiReviewClient } from "./tutti-frutti-review";

const review = {
  roomId: "room-1", sessionId: "session-1", roundId: "round-1", roundNumber: 1,
  phase: "REVIEWING", categories: [{ position: 1, label: "Nombre", entries: [
    { playerId: "a", nickname: "Ana", answerText: "Mono", isEmpty: false,
      duplicateGroupId: 2, duplicateCount: 2 },
    { playerId: "b", nickname: "Beto", answerText: "mono", isEmpty: false,
      duplicateGroupId: 2, duplicateCount: 2 }
  ] }]
};

describe("Tutti Frutti review adapter", () => {
  it("reads the gated review with only a room intent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: review, error: null });
    const client = { rpc } as TuttiFruttiReviewClient;
    await expect(getTuttiFruttiReview(client, "room-1")).resolves.toEqual(review);
    expect(rpc).toHaveBeenCalledWith("get_tutti_frutti_review", { target_room_id: "room-1" });
  });

  it("rejects malformed groups and does not expose raw database errors", async () => {
    const invalid = { ...review, categories: [{ ...review.categories[0], entries: [
      { ...review.categories[0].entries[0], duplicateCount: 1 }
    ] }] };
    await expect(getTuttiFruttiReview({ rpc: vi.fn().mockResolvedValue({ data: invalid, error: null }) }, "room-1"))
      .rejects.toThrow("reconstruir");
    await expect(getTuttiFruttiReview({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0042", message: "raw" } }) }, "room-1"))
      .rejects.toMatchObject({ message: "La revisión todavía no está disponible.", code: "P0042" });
  });
});
