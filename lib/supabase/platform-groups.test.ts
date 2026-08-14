import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCreateGroupSubmitController,
  createGroupWithAdminPlayer,
  createGroupWithAdminPlayerFromIntent
} from "./platform-groups";

const ensureAnonymousAuthIdentity = vi.hoisted(() => vi.fn());

vi.mock("./anonymous-auth", () => ({
  ensureAnonymousAuthIdentity
}));

const createdRow = {
  group_id: "group-1",
  created_group_name: "Familia",
  group_created_at: "2026-08-14T12:00:00.000Z",
  admin_player_id: "player-1",
  player_id: "player-1",
  created_player_nickname: "Ramiro",
  player_created_at: "2026-08-14T12:00:00.000Z"
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("createGroupWithAdminPlayer", () => {
  it("calls the authoritative RPC without sending auth_user_id", async () => {
    const supabase = {
      rpc: vi.fn(
        async (
          fn: "create_group_with_admin_player",
          args: { group_name: string; player_nickname: string }
        ) => {
          void fn;
          void args;

          return {
            data: [createdRow],
            error: null
          };
        }
      )
    };

    await expect(
      createGroupWithAdminPlayer(supabase, {
        groupName: "Familia",
        playerNickname: "Ramiro"
      })
    ).resolves.toEqual({
      group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-14T12:00:00.000Z"
      },
      player: {
        id: "player-1",
        groupId: "group-1",
        nickname: "Ramiro",
        createdAt: "2026-08-14T12:00:00.000Z"
      }
    });

    expect(supabase.rpc).toHaveBeenCalledWith("create_group_with_admin_player", {
      group_name: "Familia",
      player_nickname: "Ramiro"
    });
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("auth_user_id");
  });

  it("surfaces RPC failures with product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("duplicate key value violates unique constraint")
      }))
    };

    await expect(
      createGroupWithAdminPlayer(supabase, {
        groupName: "Familia",
        playerNickname: "Ramiro"
      })
    ).rejects.toThrow(
      "No se pudo crear el grupo. Revisá los datos e intentá de nuevo."
    );
  });
});

describe("createGroupWithAdminPlayerFromIntent", () => {
  it("ensures AuthIdentity before calling the RPC", async () => {
    const calls: string[] = [];
    ensureAnonymousAuthIdentity.mockImplementationOnce(async () => {
      calls.push("auth");

      return { userId: "auth-user-1", isNew: true };
    });

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => {
        calls.push("rpc");

        return {
          data: [createdRow],
          error: null
        };
      })
    };

    await createGroupWithAdminPlayerFromIntent(supabase, {
      groupName: "Familia",
      playerNickname: "Ramiro"
    });

    expect(calls).toEqual(["auth", "rpc"]);
  });
});

describe("createCreateGroupSubmitController", () => {
  it("shares one pending group creation across double submit", async () => {
    let resolveAuth!: () => void;

    ensureAnonymousAuthIdentity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuth = () => resolve({ userId: "auth-user-1", isNew: true });
        })
    );

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => ({
        data: [createdRow],
        error: null
      }))
    };

    const controller = createCreateGroupSubmitController();
    const firstSubmit = controller.submit(supabase, {
      groupName: "Familia",
      playerNickname: "Ramiro"
    });
    const secondSubmit = controller.submit(supabase, {
      groupName: "Familia",
      playerNickname: "Ramiro"
    });

    expect(secondSubmit).toBe(firstSubmit);
    expect(ensureAnonymousAuthIdentity).toHaveBeenCalledTimes(1);

    resolveAuth();

    await expect(Promise.all([firstSubmit, secondSubmit])).resolves.toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
