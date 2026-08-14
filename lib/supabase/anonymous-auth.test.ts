import { describe, expect, it, vi } from "vitest";
import { ensureAnonymousAuthIdentity } from "./anonymous-auth";

const existingSession = {
  user: { id: "existing-user" }
};

const newSession = {
  user: { id: "new-user" }
};

type AnonymousSignInResult = {
  data: { session: typeof newSession; user: null };
  error: null;
};

describe("ensureAnonymousAuthIdentity", () => {
  it("reuses an existing Supabase Auth session", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: existingSession },
          error: null
        })),
        signInAnonymously: vi.fn()
      }
    };

    await expect(ensureAnonymousAuthIdentity(supabase)).resolves.toEqual({
      userId: "existing-user",
      isNew: false
    });
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates one anonymous identity when no session exists", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null
        })),
        signInAnonymously: vi.fn(async () => ({
          data: { session: newSession, user: null },
          error: null
        }))
      }
    };

    await expect(ensureAnonymousAuthIdentity(supabase)).resolves.toEqual({
      userId: "new-user",
      isNew: true
    });
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("surfaces Supabase session read failures", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: new Error("storage failed")
        })),
        signInAnonymously: vi.fn()
      }
    };

    await expect(ensureAnonymousAuthIdentity(supabase)).rejects.toThrow(
      "No se pudo leer la sesión de Supabase."
    );
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("surfaces anonymous sign-in failures", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null
        })),
        signInAnonymously: vi.fn(async () => ({
          data: { session: null, user: null },
          error: new Error("auth failed")
        }))
      }
    };

    await expect(ensureAnonymousAuthIdentity(supabase)).rejects.toThrow(
      "No se pudo crear la identidad anónima de Supabase."
    );
  });

  it("rejects anonymous sign-in responses without a user", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null
        })),
        signInAnonymously: vi.fn(async () => ({
          data: { session: null, user: null },
          error: null
        }))
      }
    };

    await expect(ensureAnonymousAuthIdentity(supabase)).rejects.toThrow(
      "Supabase no devolvió una identidad anónima válida."
    );
  });

  it("shares one anonymous sign-in across concurrent calls", async () => {
    let resolveSignIn!: (value: AnonymousSignInResult) => void;

    const signInResult = new Promise<AnonymousSignInResult>((resolve) => {
      resolveSignIn = resolve;
    });

    const supabase = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null
        })),
        signInAnonymously: vi.fn(() => signInResult)
      }
    };

    const firstIdentity = ensureAnonymousAuthIdentity(supabase);
    const secondIdentity = ensureAnonymousAuthIdentity(supabase);

    await Promise.resolve();

    expect(supabase.auth.signInAnonymously).toHaveBeenCalledTimes(1);

    resolveSignIn({
      data: { session: newSession, user: null },
      error: null
    });

    await expect(Promise.all([firstIdentity, secondIdentity])).resolves.toEqual([
      { userId: "new-user", isNew: true },
      { userId: "new-user", isNew: true }
    ]);
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });
});
