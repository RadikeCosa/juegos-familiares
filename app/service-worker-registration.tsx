"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type PwaUpdateState = {
  registration: globalThis.ServiceWorkerRegistration;
};

function isCriticalGameplayPath(pathname: string) {
  return (
    pathname.startsWith("/impostor/sala/") ||
    pathname.startsWith("/tutti-frutti/sala/")
  );
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
      setUpdateState({ registration });
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
    if (
      !updateState ||
      isCriticalGameplayPath(window.location.pathname) ||
      isApplyingUpdateRef.current
    ) {
      return;
    }

    isApplyingUpdateRef.current = true;
    const waitingWorker = updateState.registration.waiting;

    if (!waitingWorker) {
      isApplyingUpdateRef.current = false;
      return;
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    waitingWorker.postMessage({ type: "JUEGOS_FAMILIA_APPLY_UPDATE" });
  }

  return { applyUpdate, updateState };
}

export function ServiceWorkerRegistration() {
  const { applyUpdate, updateState } = usePwaUpdateNotice();
  const pathname = usePathname();

  if (!updateState) {
    return null;
  }

  if (isCriticalGameplayPath(pathname)) {
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
