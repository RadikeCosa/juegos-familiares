"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  createCreateRoomController,
  createJoinRoomByCodeController,
  normalizeRoomJoinCode,
  recordRoomCreationIntent,
  recordRoomJoinIntent,
  type ImpostorRoomsClient,
} from "../../lib/supabase/impostor-rooms";

function createImpostorRoomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export type RoomCreationState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "error"; message: string };

export type RoomJoinState =
  | { status: "idle" }
  | { status: "form" }
  | { status: "joining" }
  | { status: "error"; message: string };

type RoomEntryActionsControllerOptions = {
  createClient: () => ImpostorRoomsClient;
  navigate: (path: string) => void;
  onCreationStateChange: (state: RoomCreationState) => void;
  onJoinStateChange: (state: RoomJoinState) => void;
  recordCreationIntent?: (code: string) => void;
  recordJoinIntent?: (code: string) => void;
};

export type RoomEntryActionsController = {
  createRoom: () => void;
  showJoinRoomForm: () => void;
  hideJoinRoomForm: () => void;
  joinRoomByCode: (rawCode: string) => void;
};

// Shared entry point for the "create or join a Room" intent, reused by both
// /impostor (direct entry) and /impostor/grupo (secondary surface), so the
// two never diverge on single-flight, intent recording, or error handling.
export function createRoomEntryActionsController({
  createClient,
  navigate,
  onCreationStateChange,
  onJoinStateChange,
  recordCreationIntent = recordRoomCreationIntent,
  recordJoinIntent = recordRoomJoinIntent,
}: RoomEntryActionsControllerOptions): RoomEntryActionsController {
  const createRoomController = createCreateRoomController();
  const joinRoomController = createJoinRoomByCodeController();
  let creationState: RoomCreationState = { status: "idle" };
  let joinState: RoomJoinState = { status: "idle" };

  function setCreationState(next: RoomCreationState) {
    creationState = next;
    onCreationStateChange(next);
  }

  function setJoinState(next: RoomJoinState) {
    joinState = next;
    onJoinStateChange(next);
  }

  return {
    createRoom() {
      if (creationState.status === "creating") {
        return;
      }

      setCreationState({ status: "creating" });

      void createRoomController
        .submit(createClient())
        .then((lobby) => {
          recordCreationIntent(lobby.room.code);
          navigate(`/impostor/sala/${encodeURIComponent(lobby.room.code)}`);
        })
        .catch((error) => {
          setCreationState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "No pudimos crear la sala. Intentá de nuevo.",
          });
        });
    },

    showJoinRoomForm() {
      if (joinState.status === "joining") {
        return;
      }

      setJoinState({ status: "form" });
    },

    hideJoinRoomForm() {
      if (joinState.status === "joining") {
        return;
      }

      setJoinState({ status: "idle" });
    },

    joinRoomByCode(rawCode: string) {
      if (joinState.status === "joining") {
        return;
      }

      const roomCode = normalizeRoomJoinCode(rawCode);

      setJoinState({ status: "joining" });

      void joinRoomController
        .submit(createClient(), roomCode)
        .then((lobby) => {
          recordJoinIntent(lobby.room.code);
          navigate(`/impostor/sala/${encodeURIComponent(lobby.room.code)}`);
        })
        .catch((error) => {
          setJoinState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "No pudimos unir a la sala. Intentá de nuevo.",
          });
        });
    },
  };
}

export function useRoomEntryActions() {
  const router = useRouter();
  const [roomCreationState, setRoomCreationState] =
    useState<RoomCreationState>({ status: "idle" });
  const [roomJoinState, setRoomJoinState] = useState<RoomJoinState>({
    status: "idle",
  });
  const [controller] = useState(() =>
    createRoomEntryActionsController({
      createClient: createImpostorRoomsClient,
      navigate: (path) => router.push(path),
      onCreationStateChange: setRoomCreationState,
      onJoinStateChange: setRoomJoinState,
    }),
  );

  return {
    roomCreationState,
    roomJoinState,
    createRoom: () => controller.createRoom(),
    showJoinRoomForm: () => controller.showJoinRoomForm(),
    hideJoinRoomForm: () => controller.hideJoinRoomForm(),
    joinRoomByCode: (rawCode: string) => controller.joinRoomByCode(rawCode),
  };
}
