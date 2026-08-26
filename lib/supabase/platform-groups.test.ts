import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCreateGroupSubmitController,
  createGetMyActiveGroupInvitationController,
  createJoinGroupSubmitController,
  createResolveGroupInvitationController,
  createGroupWithAdminPlayer,
  createGroupWithAdminPlayerFromIntent,
  getMyPlatformPermissions,
  getMyActiveGroupInvitation,
  joinGroupWithInvitation,
  joinGroupWithInvitationFromIntent,
  resolveGroupInvitation,
  resolveGroupInvitationFromIntent
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
  player_created_at: "2026-08-14T12:00:00.000Z",
  invitation_code: "K7M4Q9XA"
};

const resolvedInvitationRow = {
  group_name: "Familia",
  canonical_code: "K7M4Q9XA"
};

const joinedInvitationRow = {
  group_name: "Familia",
  joined_player_nickname: "Pedro",
  is_admin: false
};

const activeGroupInvitationRow = {
  code: "K7M4Q9XA"
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("createGroupWithAdminPlayer", () => {
  it("calls the authoritative RPC without sending auth_user_id", async () => {
    const supabase = {
      rpc: vi.fn(
        async (fn: string, args?: Record<string, string>) => {
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
      },
      invitation: {
        code: "K7M4Q9XA",
        path: "/impostor/join/K7M4Q9XA"
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

  it("surfaces platform admin authorization failures with specific feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "42501" }
      }))
    };

    await expect(
      createGroupWithAdminPlayer(supabase, {
        groupName: "Familia",
        playerNickname: "Ramiro"
      })
    ).rejects.toThrow(
      "Solo el admin de plataforma puede crear grupos en esta etapa."
    );
  });
});

describe("getMyPlatformPermissions", () => {
  it("returns whether the current user can create groups", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{ can_create_groups: true }],
        error: null
      }))
    };

    await expect(getMyPlatformPermissions(supabase)).resolves.toEqual({
      canCreateGroups: true
    });

    expect(supabase.rpc).toHaveBeenCalledWith("get_my_platform_permissions");
  });

  it("falls back to no group creation permission when the RPC is unavailable", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "42501" }
      }))
    };

    await expect(getMyPlatformPermissions(supabase)).resolves.toEqual({
      canCreateGroups: false
    });
  });
});

describe("resolveGroupInvitation", () => {
  it("calls the authoritative resolver with only the invitation code", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string, _args?: Record<string, string>) => {
        void _fn;
        void _args;

        return {
          data: [resolvedInvitationRow],
          error: null
        };
      })
    };

    await expect(resolveGroupInvitation(supabase, " k7m4q9xa ")).resolves.toEqual({
      groupName: "Familia",
      canonicalCode: "K7M4Q9XA"
    });

    expect(supabase.rpc).toHaveBeenCalledWith("resolve_group_invitation", {
      invitation_code: " k7m4q9xa "
    });
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("group_id");
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("auth_user_id");
  });

  it("surfaces invalid invitations with product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("La invitacion no es valida.")
      }))
    };

    await expect(resolveGroupInvitation(supabase, "INVALIDO")).rejects.toThrow(
      "No pudimos encontrar ese grupo. Revisá el código e intentá de nuevo."
    );
  });
});

describe("resolveGroupInvitationFromIntent", () => {
  it("ensures AuthIdentity before resolving the invitation", async () => {
    const calls: string[] = [];
    ensureAnonymousAuthIdentity.mockImplementationOnce(async () => {
      calls.push("auth");

      return { userId: "auth-user-2", isNew: true };
    });

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => {
        calls.push("rpc");

        return {
          data: [resolvedInvitationRow],
          error: null
        };
      })
    };

    await resolveGroupInvitationFromIntent(supabase, "K7M4Q9XA");

    expect(calls).toEqual(["auth", "rpc"]);
  });
});

describe("joinGroupWithInvitation", () => {
  it("calls the authoritative join RPC without group_id or auth_user_id", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string, _args?: Record<string, string>) => {
        void _fn;
        void _args;

        return {
          data: [joinedInvitationRow],
          error: null
        };
      })
    };

    await expect(
      joinGroupWithInvitation(supabase, {
        invitationCode: "K7M4Q9XA",
        playerNickname: "Pedro"
      })
    ).resolves.toEqual({
      group: {
        name: "Familia"
      },
      player: {
        nickname: "Pedro"
      },
      isAdmin: false
    });

    expect(supabase.rpc).toHaveBeenCalledWith("join_group_with_invitation", {
      invitation_code: "K7M4Q9XA",
      player_nickname: "Pedro"
    });
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("group_id");
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty("auth_user_id");
  });

  it("surfaces duplicate nicknames with specific product-level feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "players_group_id_nickname_normalized_key"'
        }
      }))
    };

    await expect(
      joinGroupWithInvitation(supabase, {
        invitationCode: "K7M4Q9XA",
        playerNickname: "Pedro"
      })
    ).rejects.toThrow("Ese nombre ya está en uso en este grupo. Probá con otro.");
  });

  it("keeps non-nickname uniqueness failures generic", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "players_auth_user_id_key"'
        }
      }))
    };

    await expect(
      joinGroupWithInvitation(supabase, {
        invitationCode: "K7M4Q9XA",
        playerNickname: "Pedro"
      })
    ).rejects.toThrow(
      "No pudimos unirte al grupo. Revisá tu nombre e intentá de nuevo."
    );
  });
});

describe("joinGroupWithInvitationFromIntent", () => {
  it("ensures AuthIdentity before joining the group", async () => {
    const calls: string[] = [];
    ensureAnonymousAuthIdentity.mockImplementationOnce(async () => {
      calls.push("auth");

      return { userId: "auth-user-2", isNew: true };
    });

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => {
        calls.push("rpc");

        return {
          data: [joinedInvitationRow],
          error: null
        };
      })
    };

    await joinGroupWithInvitationFromIntent(supabase, {
      invitationCode: "K7M4Q9XA",
      playerNickname: "Pedro"
    });

    expect(calls).toEqual(["auth", "rpc"]);
  });
});

describe("getMyActiveGroupInvitation", () => {
  it("calls the authoritative admin invitation RPC without identifiers", async () => {
    const supabase = {
      rpc: vi.fn(async (_fn: string, _args?: Record<string, string>) => {
        void _fn;
        void _args;

        return {
          data: [activeGroupInvitationRow],
          error: null
        };
      })
    };

    await expect(getMyActiveGroupInvitation(supabase)).resolves.toEqual({
      code: "K7M4Q9XA",
      path: "/impostor/join/K7M4Q9XA"
    });

    expect(supabase.rpc).toHaveBeenCalledWith("get_my_active_group_invitation");
    expect(supabase.rpc.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("surfaces missing active invitation failures with safe product feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "P0002",
          message: "No hay una invitacion activa disponible."
        }
      }))
    };

    await expect(getMyActiveGroupInvitation(supabase)).rejects.toThrow(
      "No hay una invitación activa disponible."
    );
  });

  it("surfaces unexpected RPC failures with generic product feedback", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("network")
      }))
    };

    await expect(getMyActiveGroupInvitation(supabase)).rejects.toThrow(
      "No pudimos recuperar la invitación. Intentá de nuevo."
    );
  });

  it("surfaces empty results as a missing active invitation", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: [],
        error: null
      }))
    };

    await expect(getMyActiveGroupInvitation(supabase)).rejects.toThrow(
      "No hay una invitación activa disponible."
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

describe("join/resolve submit controllers", () => {
  it("shares one pending invitation resolution across double submit", async () => {
    let resolveAuth!: () => void;

    ensureAnonymousAuthIdentity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuth = () => resolve({ userId: "auth-user-2", isNew: true });
        })
    );

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => ({
        data: [resolvedInvitationRow],
        error: null
      }))
    };

    const controller = createResolveGroupInvitationController();
    const firstSubmit = controller.submit(supabase, "K7M4Q9XA");
    const secondSubmit = controller.submit(supabase, "K7M4Q9XA");

    expect(secondSubmit).toBe(firstSubmit);
    expect(ensureAnonymousAuthIdentity).toHaveBeenCalledTimes(1);

    resolveAuth();

    await expect(Promise.all([firstSubmit, secondSubmit])).resolves.toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("shares one pending join across double submit", async () => {
    let resolveAuth!: () => void;

    ensureAnonymousAuthIdentity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuth = () => resolve({ userId: "auth-user-2", isNew: true });
        })
    );

    const supabase = {
      auth: {
        getSession: vi.fn(),
        signInAnonymously: vi.fn()
      },
      rpc: vi.fn(async () => ({
        data: [joinedInvitationRow],
        error: null
      }))
    };

    const controller = createJoinGroupSubmitController();
    const firstSubmit = controller.submit(supabase, {
      invitationCode: "K7M4Q9XA",
      playerNickname: "Pedro"
    });
    const secondSubmit = controller.submit(supabase, {
      invitationCode: "K7M4Q9XA",
      playerNickname: "Pedro"
    });

    expect(secondSubmit).toBe(firstSubmit);
    expect(ensureAnonymousAuthIdentity).toHaveBeenCalledTimes(1);

    resolveAuth();

    await expect(Promise.all([firstSubmit, secondSubmit])).resolves.toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("createGetMyActiveGroupInvitationController", () => {
  it("shares one pending invitation recovery across double click", async () => {
    let resolveRpc!: () => void;

    const supabase = {
      rpc: vi.fn(
        () =>
          new Promise<{ data: typeof activeGroupInvitationRow[]; error: null }>(
            (resolve) => {
              resolveRpc = () =>
                resolve({
                  data: [activeGroupInvitationRow],
                  error: null
                });
            }
          )
      )
    };

    const controller = createGetMyActiveGroupInvitationController();
    const firstSubmit = controller.submit(supabase);
    const secondSubmit = controller.submit(supabase);

    expect(secondSubmit).toBe(firstSubmit);

    resolveRpc();

    await expect(Promise.all([firstSubmit, secondSubmit])).resolves.toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
