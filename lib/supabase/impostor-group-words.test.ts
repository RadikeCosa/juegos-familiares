import { describe, expect, it, vi } from "vitest";
import {
  addGroupWord,
  getMyGroupWordCount,
  listMyGroupWords
} from "./impostor-group-words";

const addedGroupWordRow = {
  id: "word-1",
  group_id: "group-1",
  text: "Harry Potter",
  normalized_text: "harry potter",
  author_player_id: "player-1",
  created_at: "2026-08-18T13:00:00.000Z"
};

const ownGroupWordRows = [
  {
    id: "word-2",
    text: "Torre Eiffel",
    created_at: "2026-08-18T13:02:00.000Z"
  },
  {
    id: "word-1",
    text: "Chocotorta",
    created_at: "2026-08-18T13:01:00.000Z"
  }
];

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

describe("getMyGroupWordCount", () => {
  it("calls the authoritative count RPC without ownership arguments", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string) => {
        void _fn;

        return {
          data: [{ total_count: 3 }],
          error: null
        };
      })
    };

    await expect(getMyGroupWordCount(supabase)).resolves.toBe(3);

    expect(supabase.rpc).toHaveBeenCalledWith("get_my_group_word_count");
    expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
  });

  it("surfaces count auth failures with safe product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "42501"
        }
      }))
    };

    await expect(getMyGroupWordCount(supabase)).rejects.toThrow(
      "Necesitás entrar a tu grupo antes de agregar palabras."
    );
  });

  it("surfaces count missing Player context explicitly", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "P0002"
        }
      }))
    };

    await expect(getMyGroupWordCount(supabase)).rejects.toThrow(
      "No pudimos reconocer tu jugador para agregar la palabra."
    );
  });

  it("rejects malformed count responses", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [],
        error: null
      }))
    };

    await expect(getMyGroupWordCount(supabase)).rejects.toThrow(
      "No pudimos confirmar la cantidad de palabras."
    );
  });
});

describe("listMyGroupWords", () => {
  it("calls the authoritative own-list RPC without ownership arguments", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string) => {
        void _fn;

        return {
          data: ownGroupWordRows,
          error: null
        };
      })
    };

    await expect(listMyGroupWords(supabase)).resolves.toEqual([
      {
        id: "word-2",
        text: "Torre Eiffel",
        createdAt: "2026-08-18T13:02:00.000Z"
      },
      {
        id: "word-1",
        text: "Chocotorta",
        createdAt: "2026-08-18T13:01:00.000Z"
      }
    ]);

    expect(supabase.rpc).toHaveBeenCalledWith("list_my_group_words");
    expect(supabase.rpc.mock.calls[0]).toHaveLength(1);
  });

  it("keeps empty own-list results distinct from identity errors", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [],
        error: null
      }))
    };

    await expect(listMyGroupWords(supabase)).resolves.toEqual([]);
  });

  it("surfaces own-list auth failures with safe product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "42501"
        }
      }))
    };

    await expect(listMyGroupWords(supabase)).rejects.toThrow(
      "Necesitás entrar a tu grupo antes de agregar palabras."
    );
  });

  it("surfaces own-list missing Player context explicitly", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "P0002"
        }
      }))
    };

    await expect(listMyGroupWords(supabase)).rejects.toThrow(
      "No pudimos reconocer tu jugador para agregar la palabra."
    );
  });

  it("rejects malformed own-list responses", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{ id: "word-1", text: "Chocotorta", group_id: "group-1" }],
        error: null
      }))
    };

    await expect(listMyGroupWords(supabase)).rejects.toThrow(
      "No pudimos cargar tus palabras."
    );
  });
});
