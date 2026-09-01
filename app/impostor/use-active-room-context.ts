"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  getMyActiveRoom,
  type ImpostorRoomsClient,
  type RoomLobby,
} from "../../lib/supabase/impostor-rooms";
import type { PlatformBootstrapState } from "../../lib/supabase/platform-bootstrap";

export type ActiveRoomContextState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "absent" }
  | { status: "success"; room: RoomLobby["room"] }
  | { status: "error"; message: string };

type LoadActiveRoomContext = () => Promise<RoomLobby | null>;

type ActiveRoomContextControllerOptions = {
  loadActiveRoom: LoadActiveRoomContext;
  onStateChange: (state: ActiveRoomContextState) => void;
};

export type ActiveRoomContextController = {
  sync: (platformState: PlatformBootstrapState) => void;
  retry: () => void;
  dispose: () => void;
};

function createImpostorRoomsClient(): ImpostorRoomsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorRoomsClient;
}

export function createActiveRoomContextController({
  loadActiveRoom,
  onStateChange,
}: ActiveRoomContextControllerOptions): ActiveRoomContextController {
  let requestSequence = 0;
  let isDisposed = false;
  let recognizedPlatformState: PlatformBootstrapState | null = null;

  function applyState(requestId: number, state: ActiveRoomContextState) {
    if (!isDisposed && requestSequence === requestId) {
      onStateChange(state);
    }
  }

  function sync(platformState: PlatformBootstrapState) {
    if (isDisposed) {
      return;
    }

    requestSequence += 1;
    const requestId = requestSequence;

    if (platformState.status !== "recognized") {
      recognizedPlatformState = null;
      onStateChange({ status: "idle" });
      return;
    }

    recognizedPlatformState = platformState;
    onStateChange({ status: "loading" });

    void loadActiveRoom()
      .then((lobby) => {
        applyState(
          requestId,
          lobby
            ? { status: "success", room: lobby.room }
            : { status: "absent" },
        );
      })
      .catch((error) => {
        applyState(requestId, {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No pudimos comprobar si tenés una sala activa.",
        });
      });
  }

  return {
    sync,
    retry() {
      if (recognizedPlatformState) {
        sync(recognizedPlatformState);
      }
    },
    dispose() {
      isDisposed = true;
      requestSequence += 1;
      recognizedPlatformState = null;
    },
  };
}

export function useActiveRoomContext(platformState: PlatformBootstrapState): {
  roomState: ActiveRoomContextState;
  retry: () => void;
} {
  const [roomState, setRoomState] = useState<ActiveRoomContextState>({
    status: "idle",
  });
  const controllerRef = useRef<ActiveRoomContextController | null>(null);
  const retry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  useEffect(() => {
    const controller = createActiveRoomContextController({
      loadActiveRoom: () => getMyActiveRoom(createImpostorRoomsClient()),
      onStateChange: setRoomState,
    });
    controllerRef.current = controller;
    controller.sync(platformState);

    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }

      controller.dispose();
    };
  }, [platformState]);

  return { roomState, retry };
}
