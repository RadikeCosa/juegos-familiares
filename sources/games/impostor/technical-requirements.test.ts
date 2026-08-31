import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const technicalRequirements = readFileSync(
  join(process.cwd(), "sources/games/impostor/technical-requirements.md"),
  "utf8",
);

describe("Impostor technical requirements PWA/cache contract", () => {
  it("keeps PWA cache separate from game-state authority", () => {
    expect(technicalRequirements).toContain("PWA cache != game-state authority");
    expect(technicalRequirements).toContain("authoritative refetch");
    expect(technicalRequirements).toContain("current valid Room/GameState");
  });

  it("marks sensitive remote state and Supabase operations as non-cacheable authority", () => {
    const forbiddenCachedAuthority = [
      "Auth/session state",
      "Player/Group remoto",
      "Room",
      "GameSession",
      "Round",
      "host",
      "Presence/liveness",
      "role",
      "word",
      "votes",
      "scoreboard live",
      "`get_my_active_room()`",
      "`get_my_game_state()`",
      "cualquier RPC o mutación Supabase",
    ];

    for (const contractItem of forbiddenCachedAuthority) {
      expect(technicalRequirements).toContain(contractItem);
    }
  });

  it("defines MVP offline as shell plus blocking connected gameplay until refetch", () => {
    expect(technicalRequirements).toContain("abrir una shell mínima si corresponde");
    expect(technicalRequirements).toContain("bloquear gameplay conectado");
    expect(technicalRequirements).toContain(
      "al volver online, ejecutar `authoritative refetch` como en Incremento 13",
    );
    expect(technicalRequirements).toContain(
      "jugar una tanda multi-dispositivo sin conexión",
    );
  });

  it("documents Increment 14 closure with external manual smokes still pending", () => {
    expect(technicalRequirements).toContain(
      "INCREMENT 14 CLOSED WITH EXTERNAL MANUAL SMOKE PENDING",
    );
    expect(technicalRequirements).toContain("14.4 Chromium desktop smoke queda cerrado");
    expect(technicalRequirements).toContain("Android Chrome installed PWA smoke");
    expect(technicalRequirements).toContain("iOS Safari Add to Home Screen smoke");
    expect(technicalRequirements).toContain(
      "real multi-actor round transition/offline/reconnect smoke",
    );
    expect(technicalRequirements).toContain("no declara offline gameplay");
    expect(technicalRequirements).toContain("no autoriza cache de estado de juego");
    expect(technicalRequirements).toContain("no convierte al service worker en");
  });
});
