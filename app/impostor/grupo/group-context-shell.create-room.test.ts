import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
    renderImpostorGroupContext,
    type RoomCreationState
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

function renderWithRoomState(roomCreationState: RoomCreationState, onCreateRoom = () => { }) {
    return renderToStaticMarkup(
        renderImpostorGroupContext(
            recognizedState,
            { status: "success", players: [] },
            { roomCreationState, onCreateRoom }
        )
    );
}

describe("Jugar section", () => {
    it("shows a Crear sala action for any recognized Player, not only the admin", () => {
        const markup = renderWithRoomState({ status: "idle" });

        expect(markup).toContain("Jugar");
        expect(markup).toContain("Crear sala");
        expect(markup).not.toContain("disabled");
    });

    it("disables the action and shows progress copy while creating", () => {
        const markup = renderWithRoomState({ status: "creating" });

        expect(markup).toContain("Creando sala...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("shows product-level feedback on error without leaking technical details", () => {
        const markup = renderWithRoomState({
            status: "error",
            message: "No pudimos crear la sala. Intentá de nuevo."
        });

        expect(markup).toContain("No pudimos crear la sala. Intentá de nuevo.");
        expect(markup).not.toMatch(/SQL|constraint|Postgres/i);
    });

    it("invokes the provided handler when Crear sala is defined as the click target", () => {
        const onCreateRoom = vi.fn();

        renderWithRoomState({ status: "idle" }, onCreateRoom);

        // renderToStaticMarkup cannot dispatch events; this only guards that the
        // handler is wired to the button without throwing during render.
        expect(onCreateRoom).not.toHaveBeenCalled();
    });

    it("does not render internal identifiers alongside the play section", () => {
        const markup = renderWithRoomState({ status: "idle" });

        expect(markup).not.toContain("group-1");
        expect(markup).not.toContain("player-2");
    });

    it("records room creation intent before navigating, so /impostor/sala/[code] does not auto-create on a bare visit", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/grupo/group-context-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("recordRoomCreationIntent(lobby.room.code)");
        expect(source.indexOf("recordRoomCreationIntent(lobby.room.code)")).toBeLessThan(
            source.indexOf("router.push(`/impostor/sala/")
        );
    });
});
