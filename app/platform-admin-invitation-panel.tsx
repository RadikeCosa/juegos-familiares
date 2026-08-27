"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase/browser-client";
import {
  createGetMyActiveGroupInvitationController,
  type GroupInvitationSummary
} from "../lib/supabase/platform-groups";

type AdminInvitationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      invitation: GroupInvitationSummary;
      copied?: "code" | "link";
      shared?: boolean;
      copyError?: string;
      shareError?: string;
    }
  | { status: "error"; message: string };

type CopyTarget = "code" | "link";
type InvitationContext = "impostor" | "platform";
type ClipboardLike = {
  writeText: (text: string) => PromiseLike<void> | void;
};
type ShareNavigatorLike = {
  clipboard?: ClipboardLike;
  share?: (data: ShareData) => PromiseLike<void> | void;
};

export function getInvitationUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function getInvitationShareData(
  invitation: GroupInvitationSummary,
  context: InvitationContext = "impostor"
) {
  const url = getInvitationUrl(invitation.path);
  const productName =
    context === "platform" ? "Juegos Familiares" : "Impostor";

  return {
    title: `Invitación a ${productName}`,
    text: `Sumate a mi grupo de ${productName}.`,
    url
  };
}

export function getCopyText(
  invitation: GroupInvitationSummary,
  target: CopyTarget
) {
  if (target === "code") {
    return invitation.code;
  }

  return getInvitationUrl(invitation.path);
}

function getLoadInvitationErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No pudimos recuperar la invitación. Intentá de nuevo.";
}

function getNavigator(): ShareNavigatorLike | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator;
}

export async function copyInvitation(
  invitation: GroupInvitationSummary,
  target: CopyTarget,
  shareNavigator: ShareNavigatorLike | undefined = getNavigator()
) {
  if (!shareNavigator?.clipboard) {
    throw new Error("Clipboard unavailable");
  }

  await shareNavigator.clipboard.writeText(getCopyText(invitation, target));
}

export async function shareInvitation(
  invitation: GroupInvitationSummary,
  shareNavigator: ShareNavigatorLike | undefined = getNavigator(),
  context: InvitationContext = "impostor"
): Promise<"shared" | "copied"> {
  const shareData = getInvitationShareData(invitation, context);

  if (shareNavigator?.share) {
    await shareNavigator.share(shareData);
    return "shared";
  }

  if (shareNavigator?.clipboard) {
    await shareNavigator.clipboard.writeText(shareData.url);
    return "copied";
  }

  throw new Error("Share unavailable");
}

export function AdminInvitationPanel({
  state,
  onLoadInvitation,
  onCopy,
  onShare,
  context = "impostor"
}: {
  state: AdminInvitationState;
  onLoadInvitation: () => void;
  onCopy: (target: CopyTarget) => void;
  onShare: () => void;
  context?: InvitationContext;
}) {
  const isLoading = state.status === "loading";
  const rootClassName =
    context === "platform"
      ? "impostor-admin-invitation platform-admin-invitation"
      : "impostor-admin-invitation";

  return (
    <div className={rootClassName}>
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
              className="impostor-action impostor-action--primary"
              type="button"
              onClick={onShare}
            >
              Compartir invitación
            </button>
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

      {state.status === "success" && state.shared ? (
        <p className="impostor-platform-context__meta" aria-live="polite">
          Invitación lista para compartir.
        </p>
      ) : null}

      {state.status === "success" && state.copyError ? (
        <p className="impostor-onboarding__status" aria-live="polite">
          {state.copyError}
        </p>
      ) : null}

      {state.status === "success" && state.shareError ? (
        <p className="impostor-onboarding__status" aria-live="polite">
          {state.shareError}
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
    onShare: () => void;
    context?: InvitationContext;
  }
) {
  return (
    <AdminInvitationPanel
      state={state}
      onLoadInvitation={options.onLoadInvitation}
      onCopy={options.onCopy}
      onShare={options.onShare}
      context={options.context}
    />
  );
}

export function AdminInvitationSection({
  context = "impostor"
}: {
  context?: InvitationContext;
} = {}) {
  const [invitationState, setInvitationState] = useState<AdminInvitationState>({
    status: "loading"
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
      setInvitationState({
        status: "error",
        message: getLoadInvitationErrorMessage(error)
      });
    }
  }

  async function handleShareInvitation() {
    if (invitationState.status !== "success") {
      return;
    }

    try {
      const result = await shareInvitation(
        invitationState.invitation,
        undefined,
        context
      );

      setInvitationState({
        ...invitationState,
        copied: result === "copied" ? "link" : undefined,
        shared: result === "shared",
        copyError: undefined,
        shareError: undefined
      });
    } catch {
      setInvitationState({
        ...invitationState,
        copied: undefined,
        shared: undefined,
        copyError: undefined,
        shareError: "No pudimos compartir la invitación."
      });
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
              shared: undefined,
              copyError: "No pudimos copiar la invitación.",
              shareError: undefined
            }
          : currentState
      );

      return;
    }

    try {
      await copyInvitation(invitationState.invitation, target);

      setInvitationState({
        ...invitationState,
        copied: target,
        shared: undefined,
        copyError: undefined,
        shareError: undefined
      });
    } catch {
      setInvitationState({
        ...invitationState,
        copied: undefined,
        shared: undefined,
        copyError: "No pudimos copiar la invitación.",
        shareError: undefined
      });
    }
  }

  useEffect(() => {
    let isActive = true;

    void invitationController.current
      .submit(createBrowserSupabaseClient())
      .then((invitation) => {
        if (isActive) {
          setInvitationState({ status: "success", invitation });
        }
      })
      .catch((error) => {
        if (isActive) {
          setInvitationState({
            status: "error",
            message: getLoadInvitationErrorMessage(error)
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <AdminInvitationPanel
      state={invitationState}
      onLoadInvitation={() => void handleLoadInvitation()}
      onCopy={(target) => void handleCopyInvitation(target)}
      onShare={() => void handleShareInvitation()}
      context={context}
    />
  );
}
