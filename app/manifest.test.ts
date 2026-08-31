import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("describes the early installable Juegos Familiares shell", () => {
    const appManifest = manifest();

    expect(appManifest.name).toBe("Juegos Familiares");
    expect(appManifest.short_name).toBe("Juegos");
    expect(appManifest.id).toBe("/");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.start_url).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.background_color).toBe("#F7FAFF");
    expect(appManifest.theme_color).toBe("#2563EB");
    expect(appManifest.lang).toBe("es-AR");
    expect(appManifest.categories).toEqual(["games", "entertainment"]);
    expect(appManifest.icons).toEqual([
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]);
  });

  it("does not declare maskable icons until the assets are verified for it", () => {
    const purposes = manifest().icons?.map((icon) => icon.purpose);

    expect(purposes).not.toContain("maskable");
  });

  it("does not lock orientation before validating installed gameplay on real devices", () => {
    expect(manifest().orientation).toBeUndefined();
  });
});
