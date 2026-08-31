import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("static-safe service worker contract", () => {
  it("keeps the runtime cache list limited to static assets and app metadata", () => {
    expect(serviceWorker).toContain('const CACHEABLE_PATH_PREFIXES = ["/_next/static/", "/icons/"]');
    expect(serviceWorker).toMatch(
      /const CACHEABLE_EXACT_PATHS = \[\s+"\/apple-icon\.png",\s+"\/favicon\.ico",\s+"\/icon\.svg",\s+"\/manifest\.webmanifest",\s+\]/,
    );
    expect(serviceWorker).toContain('"/apple-icon.png"');
    expect(serviceWorker).toContain('"/favicon.ico"');
    expect(serviceWorker).toContain('"/icon.svg"');
    expect(serviceWorker).toContain('"/manifest.webmanifest"');
    expect(serviceWorker).not.toContain('"/impostor"');
    expect(serviceWorker).not.toContain('"/impostor/sala"');
  });

  it("does not cache Supabase, RPCs or gameplay read models", () => {
    expect(serviceWorker).toContain('"supabase"');
    expect(serviceWorker).toContain('"/rpc/"');
    expect(serviceWorker).toContain('"get_my_active_room"');
    expect(serviceWorker).toContain('"get_my_game_state"');
    expect(serviceWorker).toContain("isNeverCacheRequest(request.url)");
    expect(serviceWorker).not.toMatch(/api-cache|NetworkFirst|StaleWhileRevalidate/);
  });

  it("does not use aggressive update lifecycle features", () => {
    expect(serviceWorker).not.toContain("skipWaiting");
    expect(serviceWorker).not.toContain("clients.claim");
    expect(serviceWorker).not.toContain("location.reload");
  });

  it("only handles cacheable GET requests and lets everything else hit the network", () => {
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain("url.origin !== self.location.origin");
    expect(serviceWorker).toContain("return;");
    expect(serviceWorker).toContain("event.respondWith(cacheFirst(event.request))");
  });
});
