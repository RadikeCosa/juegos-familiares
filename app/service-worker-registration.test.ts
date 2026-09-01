import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const registrationSource = readFileSync(
  join(process.cwd(), "app/service-worker-registration.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("service worker registration contract", () => {
  it("registers the static-safe service worker only as a production enhancement", () => {
    expect(registrationSource).toContain('"use client"');
    expect(registrationSource).toContain('process.env.NODE_ENV !== "production"');
    expect(registrationSource).toContain('"serviceWorker" in navigator');
    expect(registrationSource).toContain('navigator.serviceWorker.register("/sw.js", { scope: "/" })');
  });

  it("does not implement custom install prompts, background sync or automatic reloads", () => {
    expect(registrationSource).not.toContain("beforeinstallprompt");
    expect(registrationSource).not.toContain("sync");
    expect(registrationSource).not.toContain("controllerchange");
    expect(registrationSource).not.toContain("clients.claim");
  });

  it("shows update UX without offering reload inside an active room route", () => {
    expect(registrationSource).toContain('pathname.startsWith("/impostor/sala/")');
    expect(registrationSource).toContain("Salí de la sala o terminá la tanda antes de actualizar.");
    expect(registrationSource).toContain("Actualizá cuando no estés jugando una tanda.");
  });

  it("applies updates only through an explicit user action", () => {
    const applyUpdateStart = registrationSource.indexOf("function applyUpdate()");
    const applyUpdateSource = registrationSource.slice(applyUpdateStart);

    expect(applyUpdateSource).toContain("updateState.isCriticalRoute");
    expect(applyUpdateSource).toContain("postMessage({");
    expect(applyUpdateSource).toContain("JUEGOS_FAMILIA_APPLY_UPDATE");
    expect(applyUpdateSource).toContain("window.location.reload()");
    expect(registrationSource.indexOf("window.location.reload()")).toBeGreaterThan(
      applyUpdateStart,
    );
  });

  it("keeps the manual update action at a comfortable touch target", () => {
    const actionRule = cssSource.slice(
      cssSource.indexOf(".pwa-update-notice__action"),
      cssSource.indexOf(".pwa-update-notice__action:hover"),
    );

    expect(actionRule).toContain("min-height: 2.75rem");
  });
});
