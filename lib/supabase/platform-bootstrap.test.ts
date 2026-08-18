import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalIdentity } from "../platform/local-identity";
import { bootstrapPlatformContext } from "./platform-bootstrap";

const playerRow = {
  id: "player-remote",
  group_id: "group-remote",
  nickname: "Ramiro",
  created_at: "2026-08-14T12:00:00.000Z"
};

const groupRow = {
  id: "group-remote",
  name: "Familia",
  admin_player_id: "player-remote",
  created_at: "2026-08-14T12:00:00.000Z"
};

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}

function useLocalStorage() {
  const localStorage = createStorage();

  vi.stubGlobal("window", {
    localStorage
  });

  return localStorage;
}

function createSupabase({
  groupData = [groupRow],
  groupError = null,
  playerData = [playerRow],
  playerError = null,
  session = { user: { id: "auth-user" } },
  sessionError = null
}: {
  groupData?: unknown[] | null;
  groupError?: unknown;
  playerData?: unknown[] | null;
  playerError?: unknown;
  session?: { user: { id: string } } | null;
  sessionError?: unknown;
} = {}) {
  const signInAnonymously = vi.fn();
  const from = vi.fn((table: "players" | "groups") => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(async () =>
          table === "players"
            ? { data: playerData, error: playerError }
            : { data: groupData, error: groupError }
        )
      }))
    }))
  }));

  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session },
        error: sessionError
      })),
      signInAnonymously
    },
    from,
    signInAnonymously
  };
}

describe("bootstrapPlatformContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unrecognized/no-auth without creating anonymous AuthIdentity", async () => {
    useLocalStorage();
    const supabase = createSupabase({ session: null });

    await expect(bootstrapPlatformContext(supabase)).resolves.toMatchObject({
      status: "unrecognized",
      reason: "no-auth"
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.signInAnonymously).not.toHaveBeenCalled();
  });

  it("returns recognized for an existing AuthIdentity with Player and Group", async () => {
    useLocalStorage();

    await expect(bootstrapPlatformContext(createSupabase())).resolves.toEqual({
      status: "recognized",
      player: {
        id: "player-remote",
        groupId: "group-remote",
        nickname: "Ramiro",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      group: {
        id: "group-remote",
        name: "Familia",
        adminPlayerId: "player-remote",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    });

    expect(readLocalIdentity()).toMatchObject({
      playerId: "player-remote",
      groupId: "group-remote",
      nickname: "Ramiro",
      groupName: "Familia"
    });
  });

  it("returns unrecognized/no-player and clears stale LocalIdentity", async () => {
    useLocalStorage().setItem(
      "juegos-familia.local-identity",
      JSON.stringify({
        version: 1,
        playerId: "player-old",
        groupId: "group-old",
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    );

    await expect(
      bootstrapPlatformContext(createSupabase({ playerData: [] }))
    ).resolves.toEqual({
      status: "unrecognized",
      reason: "no-player"
    });

    expect(readLocalIdentity()).toBeNull();
  });

  it("returns inconsistent when Player exists without a resolvable Group", async () => {
    useLocalStorage();

    await expect(
      bootstrapPlatformContext(createSupabase({ groupData: [] }))
    ).resolves.toEqual({
      status: "inconsistent",
      reason: "player-without-group"
    });
  });

  it("returns connection-error for Player query failures", async () => {
    useLocalStorage();

    await expect(
      bootstrapPlatformContext(
        createSupabase({ playerError: new Error("network") })
      )
    ).resolves.toMatchObject({
      status: "connection-error"
    });
  });

  it("returns connection-error when Supabase rejects a request", async () => {
    useLocalStorage();
    const supabase = createSupabase();
    supabase.auth.getSession.mockRejectedValueOnce(new Error("offline"));

    await expect(bootstrapPlatformContext(supabase)).resolves.toMatchObject({
      status: "connection-error"
    });
  });

  it("returns connection-error for Group query failures", async () => {
    useLocalStorage();

    await expect(
      bootstrapPlatformContext(createSupabase({ groupError: new Error("network") }))
    ).resolves.toMatchObject({
      status: "connection-error"
    });
  });

  it("keeps manipulated LocalIdentity from authorizing context and replaces it with remote data", async () => {
    const localStorage = useLocalStorage();
    localStorage.setItem(
      "juegos-familia.local-identity",
      JSON.stringify({
        version: 1,
        playerId: "player-manipulated",
        groupId: "group-manipulated",
        nickname: "Otro",
        groupName: "Otro grupo",
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    );
    const supabase = createSupabase();

    const context = await bootstrapPlatformContext(supabase);

    expect(context).toMatchObject({
      status: "recognized",
      player: { id: "player-remote" },
      group: { id: "group-remote" }
    });
    expect(readLocalIdentity()).toMatchObject({
      playerId: "player-remote",
      groupId: "group-remote",
      nickname: "Ramiro",
      groupName: "Familia"
    });
    expect(supabase.from).toHaveBeenCalledWith("players");
  });

  it("does not query remote rows by LocalIdentity when AuthIdentity is missing", async () => {
    useLocalStorage().setItem(
      "juegos-familia.local-identity",
      JSON.stringify({
        version: 1,
        playerId: "player-old",
        groupId: "group-old",
        nickname: "Ramiro",
        groupName: "Familia",
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    );
    const supabase = createSupabase({ session: null });

    await expect(bootstrapPlatformContext(supabase)).resolves.toMatchObject({
      status: "unrecognized",
      reason: "no-auth",
      localIdentity: {
        playerId: "player-old",
        groupId: "group-old"
      }
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.signInAnonymously).not.toHaveBeenCalled();
  });
});
