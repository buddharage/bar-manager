import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-side client with service role key for API routes and server components.
// This bypasses RLS — use only in trusted server contexts.
export function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
