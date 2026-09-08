import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const technicalRequirements = readFileSync(
  join(process.cwd(), "sources/games/impostor/technical-requirements.md"),
  "utf8",
);
const technicalContract = technicalRequirements.replace(/\s+/g, " ");

describe("Impostor current technical invariants", () => {
  it("keeps identity and private state server-authoritative", () => {
    expect(technicalContract).toContain(
      "deriva `Player`, Group, Room y actor desde `auth.uid()`",
    );
    expect(technicalContract).toContain(
      "La palabra secreta no se entrega al impostor",
    );
    expect(technicalContract).toContain(
      "Los votos individuales ajenos",
    );
    expect(technicalContract).toContain(
      "Ocultar texto con React, CSS o un estado local no es una barrera de privacidad",
    );
  });

  it("preserves concurrency and retry guarantees", () => {
    expect(technicalContract).toContain(
      "Cada voto es único por `(Round, voting round, voter)`",
    );
    expect(technicalContract).toContain(
      "La puntuación se aplica exactamente una vez por Round",
    );
    expect(technicalContract).toContain(
      "scoring y cierre terminal no se aplican dos veces",
    );
    expect(technicalContract).toContain(
      "Un SessionPlayer desconectado sigue perteneciendo al roster",
    );
  });

  it("defines recovery as an authoritative reconstruction", () => {
    expect(technicalContract).toContain("authoritative refetch");
    expect(technicalContract).toContain("current valid Room/GameState");
    expect(technicalContract).toContain(
      "reemplazo de estado local stale",
    );
    expect(technicalContract).toContain(
      "estado `finished` desde historial aunque la Room ya esté cerrada",
    );
  });

  it("keeps PWA cache separate from game-state authority", () => {
    expect(technicalContract).toContain("PWA cache != game-state authority");
    expect(technicalContract).toContain(
      "No existe garantía de jugar una tanda compartida multi-dispositivo sin conexión",
    );
    expect(technicalContract).toContain(
      "las llamadas Supabase, `get_my_active_room()`, `get_my_game_state()`",
    );
    expect(technicalContract).toContain(
      "Estado privado o compartido cacheado no se presenta como autoridad vigente",
    );
  });
});
