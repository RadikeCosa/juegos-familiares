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
  const reloadAfterSafeRouteRef = useRef(false);
  const pathname = usePathname();

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

  useEffect(() => {
    if (!updateState || !("serviceWorker" in navigator)) {
      return;
    }

    function reloadWhenControlled() {
      if (isCriticalGameplayPath(window.location.pathname)) {
        reloadAfterSafeRouteRef.current = true;
        return;
      }

      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", reloadWhenControlled);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadWhenControlled);
    };
  }, [updateState]);

  useEffect(() => {
    if (!reloadAfterSafeRouteRef.current || isCriticalGameplayPath(pathname)) {
      return;
    }

    reloadAfterSafeRouteRef.current = false;
    window.location.reload();
  }, [pathname]);

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
      if (isCriticalGameplayPath(window.location.pathname)) {
        reloadAfterSafeRouteRef.current = true;
        isApplyingUpdateRef.current = false;
        return;
      }

      window.location.reload();
      return;
    }

    waitingWorker.postMessage({ type: "JUEGOS_FAMILIA_APPLY_UPDATE" });
  }

  return { applyUpdate, updateState, pathname };
}

export function ServiceWorkerRegistration() {
  const { applyUpdate, updateState, pathname } = usePwaUpdateNotice();

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
