type AnonymousUser = {
  id: string;
};

type AnonymousSession = {
  user: AnonymousUser;
};

type AnonymousAuthClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: AnonymousSession | null };
      error: unknown;
    }>;
    signInAnonymously: () => Promise<{
      data: { session: AnonymousSession | null; user: AnonymousUser | null };
      error: unknown;
    }>;
  };
};

export type AnonymousAuthIdentity = {
  userId: string;
  isNew: boolean;
};

const pendingIdentityByClient = new WeakMap<
  AnonymousAuthClient,
  Promise<AnonymousAuthIdentity>
>();

export async function ensureAnonymousAuthIdentity(
  supabase: AnonymousAuthClient
): Promise<AnonymousAuthIdentity> {
  const pendingIdentity = pendingIdentityByClient.get(supabase);

  if (pendingIdentity) {
    return pendingIdentity;
  }

  const identity = readOrCreateAnonymousAuthIdentity(supabase);

  pendingIdentityByClient.set(supabase, identity);

  try {
    return await identity;
  } finally {
    if (pendingIdentityByClient.get(supabase) === identity) {
      pendingIdentityByClient.delete(supabase);
    }
  }
}

async function readOrCreateAnonymousAuthIdentity(
  supabase: AnonymousAuthClient
): Promise<AnonymousAuthIdentity> {
  const currentSession = await supabase.auth.getSession();

  if (currentSession.error) {
    throw new Error("No se pudo leer la sesión de Supabase.");
  }

  if (currentSession.data.session?.user) {
    return {
      userId: currentSession.data.session.user.id,
      isNew: false
    };
  }

  const anonymousSignIn = await supabase.auth.signInAnonymously();

  if (anonymousSignIn.error) {
    throw new Error("No se pudo crear la identidad anónima de Supabase.");
  }

  const user = anonymousSignIn.data.user ?? anonymousSignIn.data.session?.user;

  if (!user) {
    throw new Error("Supabase no devolvió una identidad anónima válida.");
  }

  return {
    userId: user.id,
    isNew: true
  };
}
