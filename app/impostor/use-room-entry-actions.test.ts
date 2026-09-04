import { describe, expect, it, vi } from "vitest";
import {
  createRoomEntryActionsController,
  type RoomCreationState,
  type RoomJoinState,
} from "./use-room-entry-actions";
import type { ImpostorRoomsClient } from "../../lib/supabase/impostor-rooms";

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
  await Promise.resolve();
}

function createRoomLobbyRow(overrides: {
  code: string;
  status?: "lobby" | "playing" | "closed";
}) {
  return {
    room_id: "room-1",
    room_join_code: overrides.code,
    room_status: overrides.status ?? "lobby",
    participant_player_id: "player-1",
    participant_nickname: "Ramiro",
    participant_is_host: true,
    participant_is_self: true,
    participant_joined_at: "2026-08-14T12:00:00.000Z",
  };
}

describe("createRoomEntryActionsController", () => {
  it("creates a Room, records the creation intent before navigating, and single-flights a double tap", async () => {
    const deferred = createDeferred<{ data: unknown; error: unknown }>();
    const rpc = vi.fn(() => deferred.promise);
    const client = { rpc } as unknown as ImpostorRoomsClient;
    const navigate = vi.fn();
    const recordCreationIntent = vi.fn();
    const creationStates: RoomCreationState[] = [];

    const controller = createRoomEntryActionsController({
      createClient: () => client,
      navigate,
      onCreationStateChange: (state) => creationStates.push(state),
      onJoinStateChange: () => {},
      recordCreationIntent,
    });

    controller.createRoom();
    controller.createRoom();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_room");
    expect(creationStates).toEqual([{ status: "creating" }]);

    deferred.resolve({
      data: [createRoomLobbyRow({ code: "AB7KQ2M4" })],
      error: null,
    });
    await settlePromises();

    expect(recordCreationIntent).toHaveBeenCalledWith("AB7KQ2M4");
    expect(navigate).toHaveBeenCalledWith("/impostor/sala/AB7KQ2M4");
    expect(
      recordCreationIntent.mock.invocationCallOrder[0],
    ).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });

  it("shows a product-level error and allows retrying when Room creation fails", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "XXYYY" },
    }));
    const client = { rpc } as unknown as ImpostorRoomsClient;
    const navigate = vi.fn();
    const creationStates: RoomCreationState[] = [];

    const controller = createRoomEntryActionsController({
      createClient: () => client,
      navigate,
      onCreationStateChange: (state) => creationStates.push(state),
      onJoinStateChange: () => {},
    });

    controller.createRoom();
    await settlePromises();

    expect(navigate).not.toHaveBeenCalled();
    expect(creationStates).toEqual([
      { status: "creating" },
      { status: "error", message: "No pudimos crear la sala. Intentá de nuevo." },
    ]);

    controller.createRoom();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reveals the join form on request and normalizes the submitted code", async () => {
    const rpc = vi.fn(async (_fn: string, params?: { room_code: string }) => ({
      data: [createRoomLobbyRow({ code: params?.room_code ?? "" })],
      error: null,
    }));
    const client = { rpc } as unknown as ImpostorRoomsClient;
    const navigate = vi.fn();
    const recordJoinIntent = vi.fn();
    const joinStates: RoomJoinState[] = [];

    const controller = createRoomEntryActionsController({
      createClient: () => client,
      navigate,
      onCreationStateChange: () => {},
      onJoinStateChange: (state) => joinStates.push(state),
      recordJoinIntent,
    });

    controller.showJoinRoomForm();
    expect(joinStates).toEqual([{ status: "form" }]);

    controller.joinRoomByCode("  ab7kq2m4  ");
    await settlePromises();

    expect(rpc).toHaveBeenCalledWith("join_room_by_code", {
      room_code: "AB7KQ2M4",
    });
    expect(recordJoinIntent).toHaveBeenCalledWith("AB7KQ2M4");
    expect(navigate).toHaveBeenCalledWith("/impostor/sala/AB7KQ2M4");
  });

  it("single-flights a double submit while joining", async () => {
    const deferred = createDeferred<{ data: unknown; error: unknown }>();
    const rpc = vi.fn(() => deferred.promise);
    const client = { rpc } as unknown as ImpostorRoomsClient;
    const navigate = vi.fn();

    const controller = createRoomEntryActionsController({
      createClient: () => client,
      navigate,
      onCreationStateChange: () => {},
      onJoinStateChange: () => {},
    });

    controller.showJoinRoomForm();
    controller.joinRoomByCode("AB7KQ2M4");
    controller.joinRoomByCode("AB7KQ2M4");

    expect(rpc).toHaveBeenCalledTimes(1);

    deferred.resolve({
      data: [createRoomLobbyRow({ code: "AB7KQ2M4" })],
      error: null,
    });
    await settlePromises();

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("keeps the join form reachable again after a failed attempt", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "P0010" },
    }));
    const client = { rpc } as unknown as ImpostorRoomsClient;
    const navigate = vi.fn();
    const joinStates: RoomJoinState[] = [];

    const controller = createRoomEntryActionsController({
      createClient: () => client,
      navigate,
      onCreationStateChange: () => {},
      onJoinStateChange: (state) => joinStates.push(state),
    });

    controller.showJoinRoomForm();
    controller.joinRoomByCode("ZZZZZZZZ");
    await settlePromises();

    expect(navigate).not.toHaveBeenCalled();
    expect(joinStates).toEqual([
      { status: "form" },
      { status: "joining" },
      {
        status: "error",
        message: "No encontramos esa sala. Revisá el código e intentá de nuevo.",
      },
    ]);

    controller.joinRoomByCode("AB7KQ2M4");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
