import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function readPublicSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return { publishableKey, supabaseUrl };
}

export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const { publishableKey, supabaseUrl } = readPublicSupabaseConfig();
  browserClient = createBrowserClient(supabaseUrl, publishableKey);

  return browserClient;
}
