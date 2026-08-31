"use client";

import { useEffect, useRef, useState } from "react";

type PwaUpdateState = {
  isCriticalRoute: boolean;
  registration: globalThis.ServiceWorkerRegistration;
};

function isCriticalGameplayPath(pathname: string) {
  return pathname.startsWith("/impostor/sala/");
}

function usePwaUpdateNotice() {
  const [updateState, setUpdateState] = useState<PwaUpdateState | null>(null);
  const isApplyingUpdateRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    function markUpdateAvailable(registration: globalThis.ServiceWorkerRegistration) {
      setUpdateState({
        isCriticalRoute: isCriticalGameplayPath(window.location.pathname),
        registration,
      });
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        markUpdateAvailable(registration);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        installingWorker?.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            markUpdateAvailable(registration);
          }
        });
      });
    }).catch(() => {
      // PWA enhancement only; gameplay remains network-authoritative without it.
    });
  }, []);

  function applyUpdate() {
    if (!updateState || updateState.isCriticalRoute || isApplyingUpdateRef.current) {
      return;
    }

    isApplyingUpdateRef.current = true;
    updateState.registration.waiting?.postMessage({
      type: "JUEGOS_FAMILIA_APPLY_UPDATE",
    });
    window.location.reload();
  }

  return { applyUpdate, updateState };
}

export function ServiceWorkerRegistration() {
  const { applyUpdate, updateState } = usePwaUpdateNotice();

  if (!updateState) {
    return null;
  }

  if (updateState.isCriticalRoute) {
    return (
      <div className="pwa-update-notice" role="status" aria-live="polite">
        <strong>Nueva versión disponible</strong>
        <p>Salí de la sala o terminá la tanda antes de actualizar.</p>
      </div>
    );
  }

  return (
    <div className="pwa-update-notice" role="status" aria-live="polite">
      <strong>Nueva versión disponible</strong>
      <p>Actualizá cuando no estés jugando una tanda.</p>
      <button className="pwa-update-notice__action" type="button" onClick={applyUpdate}>
        Actualizar
      </button>
    </div>
  );
}
