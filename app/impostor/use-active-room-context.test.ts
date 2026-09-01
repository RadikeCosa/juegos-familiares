import { describe, expect, it, vi } from "vitest";
import {
  createActiveRoomContextController,
  type ActiveRoomContextState,
} from "./use-active-room-context";
import type { PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";
import type { RoomLobby } from "../../lib/supabase/impostor-rooms";

function createRecognizedState(
  playerId = "player-1",
  groupId = "group-1",
): PlatformBootstrapState {
  return {
    status: "recognized",
    player: {
      id: playerId,
      groupId,
      nickname: "Ramiro",
      createdAt: "2026-08-14T12:00:00.000Z",
    },
    group: {
      id: groupId,
      name: "Familia",
      adminPlayerId: playerId,
      createdAt: "2026-08-14T12:00:00.000Z",
    },
  };
}

function createLobby(code = "AB7KQ2M4"): RoomLobby {
  return {
    room: {
      id: "room-1",
      code,
      status: "lobby",
    },
    participants: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createActiveRoomContextController", () => {
  it("does not load an active Room before the platform context is recognized", () => {
    const loadActiveRoom = vi.fn(async () => createLobby());
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom,
      onStateChange: (state) => states.push(state),
    });

    controller.sync({ status: "loading" });
    controller.sync({ status: "unrecognized", reason: "no-auth" });
    controller.sync({
      status: "inconsistent",
      reason: "player-without-group",
    });
    controller.sync({ status: "connection-error" });

    expect(loadActiveRoom).not.toHaveBeenCalled();
    expect(states).toEqual([
      { status: "idle" },
      { status: "idle" },
      { status: "idle" },
      { status: "idle" },
    ]);
  });

  it("emits loading before checking an active Room", () => {
    const pending = createDeferred<RoomLobby | null>();
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom: vi.fn(() => pending.promise),
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());

    expect(states).toEqual([{ status: "loading" }]);
  });

  it("emits absent when the active Room lookup returns no Room", async () => {
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom: vi.fn(async () => null),
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());
    await settlePromises();

    expect(states).toEqual([{ status: "loading" }, { status: "absent" }]);
  });

  it("emits success with the active Room from the lookup", async () => {
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom: vi.fn(async () => createLobby("PLAY1234")),
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());
    await settlePromises();

    expect(states).toEqual([
      { status: "loading" },
      {
        status: "success",
        room: { id: "room-1", code: "PLAY1234", status: "lobby" },
      },
    ]);
  });

  it("emits error when the active Room lookup fails", async () => {
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom: vi.fn(async () => {
        throw new Error("No pudimos recuperar tu sala activa.");
      }),
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());
    await settlePromises();

    expect(states).toEqual([
      { status: "loading" },
      {
        status: "error",
        message: "No pudimos recuperar tu sala activa.",
      },
    ]);
  });

  it("retries with the current recognized platform context", async () => {
    const states: ActiveRoomContextState[] = [];
    const loadActiveRoom = vi
      .fn<() => Promise<RoomLobby | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createLobby("RETRY123"));
    const controller = createActiveRoomContextController({
      loadActiveRoom,
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());
    await settlePromises();
    controller.retry();
    await settlePromises();

    expect(loadActiveRoom).toHaveBeenCalledTimes(2);
    expect(states).toEqual([
      { status: "loading" },
      { status: "absent" },
      { status: "loading" },
      {
        status: "success",
        room: { id: "room-1", code: "RETRY123", status: "lobby" },
      },
    ]);
  });

  it("discards late responses after the recognized player or group changes", async () => {
    const first = createDeferred<RoomLobby | null>();
    const second = createDeferred<RoomLobby | null>();
    const states: ActiveRoomContextState[] = [];
    const loadActiveRoom = vi
      .fn<() => Promise<RoomLobby | null>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createActiveRoomContextController({
      loadActiveRoom,
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState("player-1", "group-1"));
    controller.sync(createRecognizedState("player-2", "group-2"));

    first.resolve(createLobby("STALE123"));
    await settlePromises();
    second.resolve(createLobby("FRESH123"));
    await settlePromises();

    expect(states).toEqual([
      { status: "loading" },
      { status: "loading" },
      {
        status: "success",
        room: { id: "room-1", code: "FRESH123", status: "lobby" },
      },
    ]);
  });

  it("discards late responses after dispose", async () => {
    const pending = createDeferred<RoomLobby | null>();
    const states: ActiveRoomContextState[] = [];
    const controller = createActiveRoomContextController({
      loadActiveRoom: vi.fn(() => pending.promise),
      onStateChange: (state) => states.push(state),
    });

    controller.sync(createRecognizedState());
    controller.dispose();
    pending.resolve(createLobby("STALE123"));
    await settlePromises();

    expect(states).toEqual([{ status: "loading" }]);
  });
});
