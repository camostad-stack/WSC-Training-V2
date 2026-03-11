import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

function requireEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function createSupabaseServerClient() {
  return createClient(
    requireEnv("SUPABASE_URL", ENV.supabaseUrl),
    requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      ENV.supabaseServiceRoleKey,
    ),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

let _supabaseAdmin: ReturnType<typeof createSupabaseServerClient> | null = null;

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createSupabaseServerClient();
  }
  return _supabaseAdmin;
}
