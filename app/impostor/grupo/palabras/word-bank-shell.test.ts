import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapState } from "../../../../lib/supabase/platform-bootstrap";
import {
  applyAddedWord,
  applyDeletedWord,
  renderWordBankContent,
  validateWordInput
} from "./word-bank-shell";

vi.mock("../../../../lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: vi.fn()
}));

const recognizedState: PlatformBootstrapState = {
  status: "recognized",
  player: {
    id: "player-1",
    groupId: "group-1",
    nickname: "Ramiro",
    createdAt: "2026-08-18T13:00:00.000Z"
  },
  group: {
    id: "group-1",
    name: "Familia",
    adminPlayerId: "player-1",
    createdAt: "2026-08-18T13:00:00.000Z"
  }
};

const ownWords = [
  {
    id: "word-1",
    text: "Chocotorta",
    createdAt: "2026-08-18T13:01:00.000Z"
  },
  {
    id: "word-2",
    text: "Torre Eiffel",
    createdAt: "2026-08-18T13:02:00.000Z"
  }
];

describe("renderWordBankContent", () => {
  it("sends direct unauthenticated visits back to Impostor without onboarding", () => {
    const markup = renderToStaticMarkup(
      renderWordBankContent(
        { status: "unrecognized", reason: "no-auth" },
        { status: "idle" },
        { status: "idle", message: "" }
      )
    );

    expect(markup).toContain("Necesitás entrar a tu grupo");
    expect(markup).toContain("/impostor");
    expect(markup).not.toContain("Crear grupo");
    expect(markup).not.toContain("Agregar palabra o frase");
  });

  it("documents that the word bank shell does not create Auth identities", () => {
    const source = readFileSync(
      join(process.cwd(), "app/impostor/grupo/palabras/word-bank-shell.tsx"),
      "utf8"
    );

    expect(source).toContain("bootstrapPlatformContext");
    expect(source).not.toContain("signInAnonymously");
    expect(source).not.toContain("createAnonymousIdentity");
  });

  it("renders loading without pretending the bank has zero words", () => {
    const markup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        { status: "loading" },
        { status: "idle", message: "" }
      )
    );

    expect(markup).toContain("Cargando banco de palabras");
    expect(markup).not.toContain("0 disponibles");
    expect(markup).not.toContain("Todavía no agregaste palabras");
  });

  it("renders the add form, total count and only the received own words", () => {
    const markup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        {
          status: "success",
          totalCount: 12,
          ownWords
        },
        { status: "idle", message: "" },
        { inputValue: "" }
      )
    );

    expect(markup).toContain("Tu grupo: Familia");
    expect(markup).toContain("Agregar palabra o frase");
    expect(markup).toContain("Palabra o frase");
    expect(markup).toContain("name=\"wordText\"");
    expect(markup).toContain("<button");
    expect(markup).toContain("12 disponibles");
    expect(markup).toContain("Tus aportes");
    expect(markup).toContain("Chocotorta");
    expect(markup).toContain("Torre Eiffel");
    expect(markup).toContain("aria-label=\"Eliminar Chocotorta\"");
    expect(markup).not.toContain("Harry Potter");
    expect(markup).not.toContain("group_id");
    expect(markup).not.toContain("normalized_text");
    expect(markup).not.toContain("author_player_id");
  });

  it("renders an empty own-list state without implying the group bank is empty", () => {
    const markup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        {
          status: "success",
          totalCount: 5,
          ownWords: []
        },
        { status: "idle", message: "" },
        { inputValue: "" }
      )
    );

    expect(markup).toContain("5 disponibles");
    expect(markup).toContain("Todavía no agregaste palabras");
  });

  it("renders safe feedback for duplicate and unexpected errors", () => {
    const duplicateMarkup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        {
          status: "success",
          totalCount: 1,
          ownWords: []
        },
        { status: "idle", message: "Esa palabra ya está en el banco." },
        { inputValue: "Chocotorta" }
      )
    );
    const errorMarkup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        { status: "error", message: "No pudimos cargar el banco." },
        { status: "idle", message: "" }
      )
    );

    expect(duplicateMarkup).toContain("aria-live=\"polite\"");
    expect(duplicateMarkup).toContain("Esa palabra ya está en el banco.");
    expect(errorMarkup).toContain("No pudimos cargar el banco.");
    expect(errorMarkup).not.toContain("SQL");
    expect(errorMarkup).not.toContain("constraint");
  });

  it("marks only the deleting word as busy", () => {
    const markup = renderToStaticMarkup(
      renderWordBankContent(
        recognizedState,
        {
          status: "success",
          totalCount: 2,
          ownWords
        },
        {
          status: "deleting",
          wordIds: ["word-1"],
          message: "Eliminando Chocotorta..."
        },
        { inputValue: "" }
      )
    );

    expect(markup).toContain("Eliminando...");
    expect(markup).toContain("Eliminar Torre Eiffel");
  });

  it("documents synchronous single-flight guards for repeated add and delete taps", () => {
    const source = readFileSync(
      join(process.cwd(), "app/impostor/grupo/palabras/word-bank-shell.tsx"),
      "utf8"
    );

    expect(source).toContain("isAddingRef.current");
    expect(source).toContain("deletingWordIdsRef.current.has(word.id)");
    expect(source).toContain("deletingWordIdsRef.current.add(word.id)");
  });
});

describe("word bank UI state helpers", () => {
  it("validates simple invalid input without reimplementing DB normalization", () => {
    expect(validateWordInput("")).toBe("Escribí una palabra o frase.");
    expect(validateWordInput("   ")).toBe("Escribí una palabra o frase.");
    expect(validateWordInput("a")).toBe("La palabra debe tener al menos 2 caracteres.");
    expect(validateWordInput("x".repeat(41))).toBe(
      "La palabra no puede tener más de 40 caracteres."
    );
    expect(validateWordInput("x".repeat(40))).toBeNull();
    expect(validateWordInput("Chocotorta")).toBeNull();
  });

  it("updates total and own list after a successful add", () => {
    const nextState = applyAddedWord(
      {
        status: "success",
        totalCount: 11,
        ownWords: []
      },
      {
        id: "word-1",
        text: "Chocotorta",
        createdAt: "2026-08-18T13:01:00.000Z"
      }
    );

    expect(nextState).toEqual({
      status: "success",
      totalCount: 12,
      ownWords: [
        {
          id: "word-1",
          text: "Chocotorta",
          createdAt: "2026-08-18T13:01:00.000Z"
        }
      ]
    });
  });

  it("updates total and own list after a successful delete", () => {
    const nextState = applyDeletedWord(
      {
        status: "success",
        totalCount: 12,
        ownWords
      },
      "word-1"
    );

    expect(nextState).toEqual({
      status: "success",
      totalCount: 11,
      ownWords: [
        {
          id: "word-2",
          text: "Torre Eiffel",
          createdAt: "2026-08-18T13:02:00.000Z"
        }
      ]
    });
  });
});
