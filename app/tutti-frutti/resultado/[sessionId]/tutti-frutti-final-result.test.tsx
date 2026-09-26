import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveRoomLobby } from "../../../../lib/supabase/impostor-rooms";
import type { TuttiFruttiFinalResult } from "../../../../lib/supabase/tutti-frutti-result";
import { getPlayingRoomRouteForResult, TuttiFruttiFinalResultView } from "./tutti-frutti-final-result";

const result: TuttiFruttiFinalResult = {
  roomId: "room-1", roomCode: "TUTT1234", sessionId: "session-1",
  finishedAt: "2026-09-25T13:00:00Z", serverNow: "2026-09-25T13:00:01Z",
  roundCount: 3, totals: [
    { playerId: "a", nickname: "Ana", totalPoints: 40, rank: 1 },
    { playerId: "b", nickname: "Beto", totalPoints: 40, rank: 1 },
    { playerId: "c", nickname: "Cata", totalPoints: 30, rank: 3 }
  ], winnerPlayerIds: ["a", "b"], isTie: true, canReturnToRoom: true
};

describe("Tutti Frutti final result", () => {
  it("routes a result viewer into the matching Room after a new session starts", () => {
    const active: ActiveRoomLobby = {
      room: { id: "room-1", code: "TUTT1234", status: "playing", gameType: "tutti_frutti" },
      participants: []
    };
    expect(getPlayingRoomRouteForResult("room-1", active)).toBe("/tutti-frutti/sala/TUTT1234");
    expect(getPlayingRoomRouteForResult("room-other", active)).toBeNull();
    expect(getPlayingRoomRouteForResult("room-1", {
      ...active, room: { ...active.room, status: "lobby" }
    })).toBeNull();
  });

  it("shows a multi-player tie and a stable return-to-lobby link", () => {
    const markup = renderToStaticMarkup(createElement(TuttiFruttiFinalResultView, { result }));
    expect(markup).toContain("Empate entre Ana, Beto");
    expect(markup).toContain("1. Ana");
    expect(markup).toContain("3. Cata");
    expect(markup).toContain("40 puntos");
    expect(markup).toContain("/tutti-frutti/sala/TUTT1234?postgame=session-1");
  });

  it("does not offer Room return after the participant leaves", () => {
    const markup = renderToStaticMarkup(createElement(TuttiFruttiFinalResultView, {
      result: { ...result, roomCode: null, canReturnToRoom: false,
        winnerPlayerIds: ["a"], isTie: false,
        totals: result.totals.map((player, index) => ({ ...player, rank: index + 1 })) }
    }));
    expect(markup).toContain("Ana ganó la partida");
    expect(markup).toContain("Volver a Juegos Familiares");
    expect(markup).not.toContain("Ir al lobby");
  });
});
