import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalIdentity,
  readLocalIdentity,
  writeLocalIdentity
} from "./local-identity";

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

describe("LocalIdentity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats non-browser execution as missing LocalIdentity", () => {
    expect(readLocalIdentity()).toBeNull();
  });

  it("reads a valid LocalIdentity payload", () => {
    const localStorage = useLocalStorage();

    localStorage.setItem(
      "juegos-familia.local-identity",
      JSON.stringify({
        version: 1,
        playerId: "player-1",
        groupId: "group-1",
        nickname: "Ramiro",
        groupName: "Familia",
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    );

    expect(readLocalIdentity()).toEqual({
      version: 1,
      playerId: "player-1",
      groupId: "group-1",
      nickname: "Ramiro",
      groupName: "Familia",
      updatedAt: "2026-08-14T12:00:00.000Z"
    });
  });

  it("ignores corrupt JSON and unsupported payloads", () => {
    const localStorage = useLocalStorage();

    localStorage.setItem("juegos-familia.local-identity", "{");
    expect(readLocalIdentity()).toBeNull();

    localStorage.setItem(
      "juegos-familia.local-identity",
      JSON.stringify({
        version: 2,
        playerId: "player-1",
        groupId: "group-1",
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    );
    expect(readLocalIdentity()).toBeNull();
  });

  it("writes, replaces, and clears LocalIdentity", () => {
    useLocalStorage();

    writeLocalIdentity(
      {
        playerId: "player-1",
        groupId: "group-1",
        nickname: "Ramiro",
        groupName: "Familia"
      },
      new Date("2026-08-14T12:00:00.000Z")
    );

    expect(readLocalIdentity()).toMatchObject({
      playerId: "player-1",
      groupId: "group-1",
      nickname: "Ramiro",
      groupName: "Familia"
    });

    writeLocalIdentity(
      {
        playerId: "player-2",
        groupId: "group-2",
        nickname: "Pedro",
        groupName: "Amigos"
      },
      new Date("2026-08-14T12:05:00.000Z")
    );

    expect(readLocalIdentity()).toEqual({
      version: 1,
      playerId: "player-2",
      groupId: "group-2",
      nickname: "Pedro",
      groupName: "Amigos",
      updatedAt: "2026-08-14T12:05:00.000Z"
    });

    clearLocalIdentity();

    expect(readLocalIdentity()).toBeNull();
  });
});
