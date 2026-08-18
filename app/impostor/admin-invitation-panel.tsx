"use client";

import { useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import {
  createGetMyActiveGroupInvitationController,
  type GroupInvitationSummary
} from "../../lib/supabase/platform-groups";

type AdminInvitationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      invitation: GroupInvitationSummary;
      copied?: "code" | "link";
      copyError?: string;
    }
  | { status: "error"; message: string };

type CopyTarget = "code" | "link";

function getInvitationUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

function getCopyText(
  invitation: GroupInvitationSummary,
  target: CopyTarget
) {
  if (target === "code") {
    return invitation.code;
  }

  return getInvitationUrl(invitation.path);
}

export function AdminInvitationPanel({
  state,
  onLoadInvitation,
  onCopy
}: {
  state: AdminInvitationState;
  onLoadInvitation: () => void;
  onCopy: (target: CopyTarget) => void;
}) {
  const isLoading = state.status === "loading";

  return (
    <div className="impostor-admin-invitation">
      <p>Invitá a los demás para que se unan al grupo.</p>
      <button
        className="impostor-action impostor-action--primary"
        type="button"
        disabled={isLoading}
        onClick={onLoadInvitation}
      >
        {isLoading ? "Buscando invitación..." : "Invitar personas"}
      </button>

      {state.status === "success" ? (
        <dl className="impostor-created-group" aria-live="polite">
          <div>
            <dt>Código de invitación</dt>
            <dd>{state.invitation.code}</dd>
            <button
              className="impostor-action"
              type="button"
              onClick={() => onCopy("code")}
            >
              Copiar código
            </button>
          </div>
          <div>
            <dt>Enlace de invitación</dt>
            <dd>{getInvitationUrl(state.invitation.path)}</dd>
            <button
              className="impostor-action"
              type="button"
              onClick={() => onCopy("link")}
            >
              Copiar enlace
            </button>
          </div>
        </dl>
      ) : null}

      {state.status === "success" && state.copied ? (
        <p className="impostor-platform-context__meta" aria-live="polite">
          {state.copied === "code" ? "Código copiado." : "Enlace copiado."}
        </p>
      ) : null}

      {state.status === "success" && state.copyError ? (
        <p className="impostor-onboarding__status" aria-live="polite">
          {state.copyError}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="impostor-onboarding__status" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function renderAdminInvitationPanel(
  state: AdminInvitationState,
  options: {
    onLoadInvitation: () => void;
    onCopy: (target: CopyTarget) => void;
  }
) {
  return (
    <AdminInvitationPanel
      state={state}
      onLoadInvitation={options.onLoadInvitation}
      onCopy={options.onCopy}
    />
  );
}

export function AdminInvitationSection() {
  const [invitationState, setInvitationState] = useState<AdminInvitationState>({
    status: "idle"
  });
  const invitationController = useRef(createGetMyActiveGroupInvitationController());

  async function handleLoadInvitation() {
    if (invitationState.status === "loading") {
      return;
    }

    setInvitationState({ status: "loading" });

    try {
      const invitation = await invitationController.current.submit(
        createBrowserSupabaseClient()
      );

      setInvitationState({ status: "success", invitation });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos recuperar la invitación. Intentá de nuevo.";

      setInvitationState({ status: "error", message });
    }
  }

  async function handleCopyInvitation(target: CopyTarget) {
    if (
      invitationState.status !== "success" ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      setInvitationState((currentState) =>
        currentState.status === "success"
          ? {
              ...currentState,
              copied: undefined,
              copyError: "No pudimos copiar la invitación."
            }
          : currentState
      );

      return;
    }

    try {
      await navigator.clipboard.writeText(
        getCopyText(invitationState.invitation, target)
      );

      setInvitationState({
        ...invitationState,
        copied: target,
        copyError: undefined
      });
    } catch {
      setInvitationState({
        ...invitationState,
        copied: undefined,
        copyError: "No pudimos copiar la invitación."
      });
    }
  }

  return (
    <AdminInvitationPanel
      state={invitationState}
      onLoadInvitation={() => void handleLoadInvitation()}
      onCopy={(target) => void handleCopyInvitation(target)}
    />
  );
}
