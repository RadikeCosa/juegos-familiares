import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
    renderImpostorGroupContext,
    type RoomJoinState
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

function renderWithJoinState(roomJoinState: RoomJoinState) {
    return renderToStaticMarkup(
        renderImpostorGroupContext(
            recognizedState,
            { status: "success", players: [] },
            { roomJoinState }
        )
    );
}

describe("Unirme a una sala action", () => {
    it("shows the entry point next to Crear sala", () => {
        const markup = renderWithJoinState({ status: "idle" });

        expect(markup).toContain("Crear sala");
        expect(markup).toContain("Unirme a una sala");
    });

    it("reveals a room code form once the entry point is used", () => {
        const markup = renderWithJoinState({ status: "form" });

        expect(markup).toContain("Código de sala");
        expect(markup).toContain("Unirme");
    });

    it("disables the form while joining", () => {
        const markup = renderWithJoinState({ status: "joining" });

        expect(markup).toContain("Uniéndote...");
        expect(markup).toContain("disabled=\"\"");
    });

    it("shows product-level feedback on error without leaking technical details", () => {
        const markup = renderWithJoinState({
            status: "error",
            message: "Ya estás en otra sala."
        });

        expect(markup).toContain("Ya estás en otra sala.");
        expect(markup).not.toMatch(/SQL|constraint|Postgres/i);
    });

    it("records room join intent before navigating, so /impostor/sala/[code] reuses the join result", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/grupo/group-context-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("recordRoomJoinIntent(lobby.room.code)");
        expect(source.indexOf("recordRoomJoinIntent(lobby.room.code)")).toBeLessThan(
            source.lastIndexOf("router.push(`/impostor/sala/")
        );
    });

    it("normalizes the room code sent from the join form", () => {
        const source = readFileSync(
            join(process.cwd(), "app/impostor/grupo/group-context-shell.tsx"),
            "utf8"
        );

        expect(source).toContain("normalizeRoomJoinCode(");
        expect(source).toContain("formData.get(\"roomCode\")");
    });
});
