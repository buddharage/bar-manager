import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/auth/google/status — check if Google tokens exist
export async function GET() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("settings")
    .select("key")
    .eq("key", "google_tokens")
    .single();

  return NextResponse.json({ connected: !!data });
}

// DELETE /api/auth/google/status — remove stored Google tokens
export async function DELETE() {
  const supabase = createServerClient();
  await supabase.from("settings").delete().eq("key", "google_tokens");
  return NextResponse.json({ success: true });
}
