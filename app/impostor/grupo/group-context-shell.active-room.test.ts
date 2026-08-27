import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
    renderImpostorGroupContext,
    type ActiveRoomState
} from "./group-context-shell";
import type { PlatformBootstrapState } from "../../../lib/supabase/platform-bootstrap";

vi.mock("../../../lib/supabase/browser-client", () => ({
    createBrowserSupabaseClient: vi.fn()
}));

const recognizedState: PlatformBootstrapState = {
    status: "recognized",
    player: {
        id: "player-2",
        groupId: "group-1",
        nickname: "Pedro",
        createdAt: "2026-08-19T12:01:00.000Z"
    },
    group: {
        id: "group-1",
        name: "Familia",
        adminPlayerId: "player-1",
        createdAt: "2026-08-19T12:00:00.000Z"
    }
};

function renderWithActiveRoomState(activeRoomState: ActiveRoomState) {
    return renderToStaticMarkup(
        renderImpostorGroupContext(
            recognizedState,
            { status: "success", players: [] },
            { activeRoomState }
        )
    );
}

describe("active Room awareness", () => {
    it("keeps the create and join actions when no active Room exists", () => {
        const markup = renderWithActiveRoomState({ status: "absent" });

        expect(markup).toContain("Crear sala");
        expect(markup).toContain("Unirme a una sala");
        expect(markup).not.toContain("Volver a la sala");
    });

    it("shows a single return CTA for an active lobby Room", () => {
        const markup = renderWithActiveRoomState({
            status: "success",
            room: {
                id: "room-1",
                code: "ABC123XY",
                status: "lobby"
            }
        });

        expect(markup).toContain("Sala activa");
        expect(markup).toContain("Volver a la sala");
        expect(markup).toContain("href=\"/impostor/sala/ABC123XY\"");
        expect(markup).not.toContain("Crear sala");
        expect(markup).not.toContain("Unirme a una sala");
    });

    it("shows the same return CTA for an active playing Room", () => {
        const markup = renderWithActiveRoomState({
            status: "success",
            room: {
                id: "room-1",
                code: "PLAY1234",
                status: "playing"
            }
        });

        expect(markup).toContain("Sala activa");
        expect(markup).toContain("Volver a la sala");
        expect(markup).toContain("href=\"/impostor/sala/PLAY1234\"");
        expect(markup).not.toContain("Crear sala");
        expect(markup).not.toContain("Unirme a una sala");
    });

    it("keeps Group usable when active Room lookup fails", () => {
        const markup = renderWithActiveRoomState({
            status: "error",
            message: "No pudimos recuperar tu sala activa. Intentá de nuevo."
        });

        expect(markup).toContain("Familia");
        expect(markup).toContain("Integrantes");
        expect(markup).toContain("No pudimos recuperar tu sala activa");
        expect(markup).toContain("Crear sala");
        expect(markup).toContain("Unirme a una sala");
        expect(markup).not.toContain("Volver a la sala");
    });

    it("does not flash create or join actions while checking the active Room", () => {
        const markup = renderWithActiveRoomState({ status: "loading" });

        expect(markup).toContain("Comprobando sala activa");
        expect(markup).not.toContain("Crear sala");
        expect(markup).not.toContain("Unirme a una sala");
        expect(markup).not.toContain("Volver a la sala");
    });
});
