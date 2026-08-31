import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const registrationSource = readFileSync(
  join(process.cwd(), "app/service-worker-registration.tsx"),
  "utf8",
);

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
    expect(registrationSource).not.toContain("location.reload");
    expect(registrationSource).not.toContain("skipWaiting");
  });
});
