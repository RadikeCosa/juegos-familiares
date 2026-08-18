import { afterEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient
}));

async function importBrowserClientModule() {
  return import("./browser-client");
}

describe("createBrowserSupabaseClient", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createBrowserClient.mockClear();
  });

  it("does not initialize Supabase when the module is imported", async () => {
    await importBrowserClientModule();

    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it("fails clearly when public Supabase config is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const { createBrowserSupabaseClient } = await importBrowserClientModule();

    expect(() => createBrowserSupabaseClient()).toThrow(
      "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it("creates the browser client lazily and reuses it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");

    const { createBrowserSupabaseClient } = await importBrowserClientModule();

    const firstClient = createBrowserSupabaseClient();
    const secondClient = createBrowserSupabaseClient();

    expect(secondClient).toBe(firstClient);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "public-test-key"
    );
  });
});
