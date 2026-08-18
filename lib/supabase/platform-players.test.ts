import { describe, expect, it, vi } from "vitest";
import { listGroupPlayers } from "./platform-players";

describe("listGroupPlayers", () => {
  it("selects only product-safe player fields from the current group", async () => {
    const order = vi.fn(
      async (column: "created_at", options: { ascending: true }) => {
        void column;
        void options;

        return {
          data: [
            {
              id: "player-1",
              nickname: "Ramiro",
              created_at: "2026-08-14T12:00:00.000Z"
            }
          ],
          error: null
        };
      }
    );
    const eq = vi.fn((column: "group_id", value: string) => {
      void column;
      void value;

      return { order };
    });
    const select = vi.fn((columns: string) => {
      void columns;

      return { eq };
    });
    const supabase = {
      from: vi.fn(() => ({ select }))
    };

    await expect(listGroupPlayers(supabase, "group-1")).resolves.toEqual([
      {
        id: "player-1",
        nickname: "Ramiro",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    ]);

    expect(supabase.from).toHaveBeenCalledWith("players");
    expect(select).toHaveBeenCalledWith("id, nickname, created_at");
    expect(select.mock.calls[0]?.[0]).not.toContain("auth_user_id");
    expect(eq).toHaveBeenCalledWith("group_id", "group-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("surfaces query failures with product feedback", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: null,
              error: new Error("network")
            }))
          }))
        }))
      }))
    };

    await expect(listGroupPlayers(supabase, "group-1")).rejects.toThrow(
      "No pudimos cargar los integrantes. Intentá de nuevo."
    );
  });
});
