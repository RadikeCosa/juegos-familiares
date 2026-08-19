"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject
} from "react";
import { createBrowserSupabaseClient } from "../../../../lib/supabase/browser-client";
import {
  addGroupWord,
  deleteMyGroupWord,
  getMyGroupWordCount,
  listMyGroupWords,
  type ImpostorGroupWordsClient,
  type MyGroupWord
} from "../../../../lib/supabase/impostor-group-words";
import {
  bootstrapPlatformContext,
  type PlatformBootstrapClient,
  type PlatformBootstrapState
} from "../../../../lib/supabase/platform-bootstrap";
import { formatAvailableWords } from "../group-context-shell";

type WordBankDataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; totalCount: number; ownWords: MyGroupWord[] }
  | { status: "error"; message: string };

type WordMutationState =
  | { status: "idle"; message: string }
  | { status: "adding"; message: string }
  | { status: "deleting"; wordId: string; message: string };

const GENERIC_LOAD_ERROR = "No pudimos cargar el banco de palabras. Intentá de nuevo.";
const EMPTY_WORD_ERROR = "Escribí una palabra o frase.";
const SHORT_WORD_ERROR = "La palabra debe tener al menos 2 caracteres.";
const LONG_WORD_ERROR = "La palabra no puede tener más de 40 caracteres.";
const ADD_SUCCESS_MESSAGE = "Palabra agregada.";
const DELETE_SUCCESS_MESSAGE = "Palabra eliminada.";
const DELETE_FALSE_MESSAGE =
  "No pudimos borrar esa palabra. Actualizá el banco e intentá de nuevo.";

function createPlatformBootstrapClient(): PlatformBootstrapClient {
  return createBrowserSupabaseClient() as unknown as PlatformBootstrapClient;
}

function createImpostorGroupWordsClient(): ImpostorGroupWordsClient {
  return createBrowserSupabaseClient() as unknown as ImpostorGroupWordsClient;
}

function getFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function validateWordInput(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return EMPTY_WORD_ERROR;
  }

  if (trimmedValue.length === 1) {
    return SHORT_WORD_ERROR;
  }

  if (trimmedValue.length > 40) {
    return LONG_WORD_ERROR;
  }

  return null;
}

function replaceOwnWord(words: MyGroupWord[], word: MyGroupWord) {
  return [
    {
      id: word.id,
      text: word.text,
      createdAt: word.createdAt
    },
    ...words.filter((currentWord) => currentWord.id !== word.id)
  ];
}

export function applyAddedWord(
  dataState: WordBankDataState,
  word: MyGroupWord
): WordBankDataState {
  if (dataState.status !== "success") {
    return dataState;
  }

  return {
    status: "success",
    totalCount: dataState.totalCount + 1,
    ownWords: replaceOwnWord(dataState.ownWords, word)
  };
}

export function applyDeletedWord(
  dataState: WordBankDataState,
  wordId: string
): WordBankDataState {
  if (dataState.status !== "success") {
    return dataState;
  }

  return {
    status: "success",
    totalCount: Math.max(0, dataState.totalCount - 1),
    ownWords: dataState.ownWords.filter((word) => word.id !== wordId)
  };
}

type WordBankContentOptions = {
  inputRef?: RefObject<HTMLInputElement | null>;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onRetryBootstrap?: () => void;
  onRetryData?: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: (word: MyGroupWord) => void;
};

function WordBankContent({
  bootstrapState,
  dataState,
  mutationState,
  options = {}
}: {
  bootstrapState: PlatformBootstrapState;
  dataState: WordBankDataState;
  mutationState: WordMutationState;
  options?: WordBankContentOptions;
}) {
  const {
    inputRef,
    inputValue,
    onDelete,
    onInputChange,
    onRetryBootstrap,
    onRetryData,
    onSubmit
  } = options;

  return renderWordBankContent(bootstrapState, dataState, mutationState, {
    inputRef,
    inputValue,
    onDelete,
    onInputChange,
    onRetryBootstrap,
    onRetryData,
    onSubmit
  });
}

export function renderWordBankContent(
  bootstrapState: PlatformBootstrapState,
  dataState: WordBankDataState,
  mutationState: WordMutationState,
  options: WordBankContentOptions = {}
) {
  if (bootstrapState.status === "loading") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <h1>Comprobando tu grupo...</h1>
      </section>
    );
  }

  if (bootstrapState.status === "unrecognized") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Banco de palabras</p>
        <h1>Necesitás entrar a tu grupo.</h1>
        <p>Volvé a Impostor para crear un grupo o unirte con una invitación.</p>
        <Link
          className="impostor-action impostor-action--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "inconsistent") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Banco de palabras</p>
        <h1>No pudimos recuperar correctamente tu grupo.</h1>
        <p>Volvé a Impostor para revisar tu contexto.</p>
        <Link
          className="impostor-action impostor-action--primary"
          href="/impostor"
        >
          Ir a Impostor
        </Link>
      </section>
    );
  }

  if (bootstrapState.status === "connection-error") {
    return (
      <section className="impostor-group-card" aria-live="polite">
        <p className="impostor-kicker">Banco de palabras</p>
        <h1>No pudimos comprobar tu grupo ahora.</h1>
        <p>Revisá tu conexión e intentá de nuevo.</p>
        {options.onRetryBootstrap ? (
          <button
            className="impostor-action impostor-action--primary"
            type="button"
            onClick={options.onRetryBootstrap}
          >
            Reintentar
          </button>
        ) : null}
      </section>
    );
  }

  const isAdding = mutationState.status === "adding";
  const canSubmit = dataState.status === "success" && !isAdding;

  return (
    <section
      className="impostor-group-card impostor-word-bank"
      aria-labelledby="impostor-word-bank-title"
    >
      <p className="impostor-kicker">Tu grupo: {bootstrapState.group.name}</p>
      <h1 id="impostor-word-bank-title">Banco de palabras</h1>

      {dataState.status === "loading" || dataState.status === "idle" ? (
        <p aria-live="polite">Cargando banco de palabras...</p>
      ) : null}

      {dataState.status === "error" ? (
        <div className="impostor-group-error" aria-live="polite">
          <p>{dataState.message}</p>
          {options.onRetryData ? (
            <button
              className="impostor-action impostor-action--primary"
              type="button"
              onClick={options.onRetryData}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {dataState.status === "success" ? (
        <>
          <form
            className="impostor-word-form"
            aria-labelledby="impostor-word-form-title"
            onSubmit={options.onSubmit}
          >
            <h2 id="impostor-word-form-title">Agregar palabra o frase</h2>
            <label className="impostor-field" htmlFor="impostor-word-input">
              <span>Palabra o frase</span>
              <input
                ref={options.inputRef}
                id="impostor-word-input"
                name="wordText"
                type="text"
                autoComplete="off"
                maxLength={40}
                disabled={isAdding}
                value={options.inputValue ?? ""}
                onChange={(event) => options.onInputChange?.(event.target.value)}
              />
            </label>
            <button
              className="impostor-action impostor-action--primary"
              type="submit"
              disabled={!canSubmit}
            >
              {isAdding ? "Agregando..." : "Agregar"}
            </button>
          </form>

          <p className="impostor-word-bank-count">
            {formatAvailableWords(dataState.totalCount)}
          </p>

          <div
            className="impostor-group-section"
            aria-labelledby="impostor-own-words-title"
          >
            <h2 id="impostor-own-words-title">Tus aportes</h2>
            {dataState.ownWords.length === 0 ? (
              <p>Todavía no agregaste palabras.</p>
            ) : (
              <ul className="impostor-own-words">
                {dataState.ownWords.map((word) => {
                  const isDeleting =
                    mutationState.status === "deleting" &&
                    mutationState.wordId === word.id;

                  return (
                    <li key={word.id}>
                      <span>{word.text}</span>
                      <button
                        className="impostor-action"
                        type="button"
                        aria-label={`Eliminar ${word.text}`}
                        disabled={isDeleting}
                        onClick={() => options.onDelete?.(word)}
                      >
                        {isDeleting ? "Eliminando..." : "Eliminar"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <p className="impostor-word-bank-feedback" aria-live="polite">
        {mutationState.message}
      </p>
    </section>
  );
}

export function ImpostorWordBankShell() {
  const [bootstrapState, setBootstrapState] = useState<PlatformBootstrapState>({
    status: "loading"
  });
  const [dataState, setDataState] = useState<WordBankDataState>({
    status: "idle"
  });
  const [mutationState, setMutationState] = useState<WordMutationState>({
    status: "idle",
    message: ""
  });
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function runBootstrap(showLoading: boolean) {
    if (showLoading) {
      setBootstrapState({ status: "loading" });
      setDataState({ status: "idle" });
      setMutationState({ status: "idle", message: "" });
    }

    setBootstrapState(await bootstrapPlatformContext(createPlatformBootstrapClient()));
  }

  async function loadWordBank() {
    setDataState({ status: "loading" });

    try {
      const client = createImpostorGroupWordsClient();
      const [totalCount, ownWords] = await Promise.all([
        getMyGroupWordCount(client),
        listMyGroupWords(client)
      ]);

      setDataState({ status: "success", totalCount, ownWords });
    } catch (error) {
      setDataState({
        status: "error",
        message: getFriendlyError(error, GENERIC_LOAD_ERROR)
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mutationState.status === "adding" || dataState.status !== "success") {
      return;
    }

    const validationError = validateWordInput(inputValue);

    if (validationError) {
      setMutationState({ status: "idle", message: validationError });
      inputRef.current?.focus();

      return;
    }

    setMutationState({ status: "adding", message: "Agregando palabra..." });

    try {
      const addedWord = await addGroupWord(
        createImpostorGroupWordsClient(),
        inputValue
      );

      setDataState((currentState) => applyAddedWord(currentState, {
        id: addedWord.id,
        text: addedWord.text,
        createdAt: addedWord.createdAt
      }));
      setInputValue("");
      setMutationState({ status: "idle", message: ADD_SUCCESS_MESSAGE });
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setMutationState({
        status: "idle",
        message: getFriendlyError(
          error,
          "No pudimos agregar la palabra. Intentá de nuevo."
        )
      });
      inputRef.current?.focus();
    }
  }

  async function handleDelete(word: MyGroupWord) {
    if (mutationState.status === "deleting") {
      return;
    }

    setMutationState({
      status: "deleting",
      wordId: word.id,
      message: `Eliminando ${word.text}...`
    });

    try {
      const wasDeleted = await deleteMyGroupWord(
        createImpostorGroupWordsClient(),
        word.id
      );

      if (wasDeleted) {
        setDataState((currentState) => applyDeletedWord(currentState, word.id));
        setMutationState({ status: "idle", message: DELETE_SUCCESS_MESSAGE });

        return;
      }

      await loadWordBank();
      setMutationState({ status: "idle", message: DELETE_FALSE_MESSAGE });
    } catch (error) {
      setMutationState({
        status: "idle",
        message: getFriendlyError(
          error,
          "No pudimos borrar la palabra. Intentá de nuevo."
        )
      });
    }
  }

  useEffect(() => {
    let isActive = true;

    void bootstrapPlatformContext(createPlatformBootstrapClient()).then(
      (nextBootstrapState) => {
        if (isActive) {
          setBootstrapState(nextBootstrapState);
        }
      }
    );

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (bootstrapState.status !== "recognized") {
      return;
    }

    let isActive = true;

    void Promise.resolve()
      .then(() => {
        if (isActive) {
          setDataState({ status: "loading" });
        }

        const client = createImpostorGroupWordsClient();

        return Promise.all([
          getMyGroupWordCount(client),
          listMyGroupWords(client)
        ]);
      })
      .then(([totalCount, ownWords]) => {
        if (isActive) {
          setDataState({ status: "success", totalCount, ownWords });
        }
      })
      .catch((error) => {
        if (isActive) {
          setDataState({
            status: "error",
            message: getFriendlyError(error, GENERIC_LOAD_ERROR)
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [bootstrapState]);

  return (
    <WordBankContent
      bootstrapState={bootstrapState}
      dataState={dataState}
      mutationState={mutationState}
      options={{
        inputRef,
        inputValue,
        onInputChange: setInputValue,
        onRetryBootstrap: () => void runBootstrap(true),
        onRetryData: () => void loadWordBank(),
        onSubmit: (event) => void handleSubmit(event),
        onDelete: (word) => void handleDelete(word)
      }}
    />
  );
}
