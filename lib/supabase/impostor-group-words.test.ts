import { describe, expect, it, vi } from "vitest";
import { addGroupWord } from "./impostor-group-words";

const addedGroupWordRow = {
  id: "word-1",
  group_id: "group-1",
  text: "Harry Potter",
  normalized_text: "harry potter",
  author_player_id: "player-1",
  created_at: "2026-08-18T13:00:00.000Z"
};

describe("addGroupWord", () => {
  it("calls the authoritative RPC with only the word text", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string, _args?: Record<string, string>) => {
        void _fn;
        void _args;

        return {
          data: [addedGroupWordRow],
          error: null
        };
      })
    };

    await expect(addGroupWord(supabase, "  Harry   Potter  ")).resolves.toEqual({
      id: "word-1",
      groupId: "group-1",
      text: "Harry Potter",
      normalizedText: "harry potter",
      authorPlayerId: "player-1",
      createdAt: "2026-08-18T13:00:00.000Z"
    });

    expect(supabase.rpc).toHaveBeenCalledWith("add_group_word", {
      word_text: "  Harry   Potter  "
    });
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("group_id");
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("author_player_id");
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("auth_user_id");
  });

  it("surfaces duplicate words with specific product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "23505"
        }
      }))
    };

    await expect(addGroupWord(supabase, "elefante")).rejects.toThrow(
      "Esa palabra ya está en el banco."
    );
  });

  it("surfaces invalid words with safe product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "22023"
        }
      }))
    };

    await expect(addGroupWord(supabase, "😀")).rejects.toThrow(
      "La palabra debe tener entre 2 y 40 caracteres y no puede incluir emojis."
    );
  });

  it("surfaces unauthenticated calls with safe product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "42501"
        }
      }))
    };

    await expect(addGroupWord(supabase, "Elefante")).rejects.toThrow(
      "Necesitás entrar a tu grupo antes de agregar palabras."
    );
  });

  it("surfaces missing Player context with safe product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "P0002"
        }
      }))
    };

    await expect(addGroupWord(supabase, "Elefante")).rejects.toThrow(
      "No pudimos reconocer tu jugador para agregar la palabra."
    );
  });

  it("keeps unexpected failures generic", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("network")
      }))
    };

    await expect(addGroupWord(supabase, "Elefante")).rejects.toThrow(
      "No pudimos agregar la palabra. Revisá el texto e intentá de nuevo."
    );
  });

  it("surfaces empty RPC results explicitly", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [],
        error: null
      }))
    };

    await expect(addGroupWord(supabase, "Elefante")).rejects.toThrow(
      "No pudimos confirmar que la palabra fue agregada."
    );
  });
});
