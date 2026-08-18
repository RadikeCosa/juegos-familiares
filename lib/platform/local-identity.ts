export type LocalIdentity = {
  version: 1;
  playerId: string;
  groupId: string;
  nickname?: string;
  groupName?: string;
  updatedAt: string;
};

const LOCAL_IDENTITY_KEY = "juegos-familia.local-identity";

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toLocalIdentity(value: unknown): LocalIdentity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Record<keyof LocalIdentity, unknown>>;

  if (
    candidate.version !== 1 ||
    !isNonEmptyString(candidate.playerId) ||
    !isNonEmptyString(candidate.groupId) ||
    !isNonEmptyString(candidate.updatedAt)
  ) {
    return null;
  }

  const localIdentity: LocalIdentity = {
    version: 1,
    playerId: candidate.playerId,
    groupId: candidate.groupId,
    updatedAt: candidate.updatedAt
  };

  if (isNonEmptyString(candidate.nickname)) {
    localIdentity.nickname = candidate.nickname;
  }

  if (isNonEmptyString(candidate.groupName)) {
    localIdentity.groupName = candidate.groupName;
  }

  return localIdentity;
}

export function readLocalIdentity(): LocalIdentity | null {
  const storage = getBrowserLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(LOCAL_IDENTITY_KEY);

    if (!rawValue) {
      return null;
    }

    return toLocalIdentity(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

export function writeLocalIdentity(
  identity: Omit<LocalIdentity, "version" | "updatedAt">,
  now = new Date()
): LocalIdentity | null {
  const storage = getBrowserLocalStorage();

  if (!storage) {
    return null;
  }

  const localIdentity: LocalIdentity = {
    version: 1,
    playerId: identity.playerId,
    groupId: identity.groupId,
    updatedAt: now.toISOString()
  };

  if (identity.nickname) {
    localIdentity.nickname = identity.nickname;
  }

  if (identity.groupName) {
    localIdentity.groupName = identity.groupName;
  }

  try {
    storage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(localIdentity));

    return localIdentity;
  } catch {
    return null;
  }
}

export function clearLocalIdentity() {
  const storage = getBrowserLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(LOCAL_IDENTITY_KEY);
  } catch {
    return;
  }
}
