import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/integrations/google-client";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/auth/google/callback → exchange code for tokens, store, redirect
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?google=error&message=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?google=error&message=no_code", request.url)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const supabase = createServerClient();

    const { error: upsertError } = await supabase.from("settings").upsert({
      key: "google_tokens",
      value: tokens as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      console.error("Failed to store Google tokens:", upsertError);
      return NextResponse.redirect(
        new URL(`/settings?google=error&message=${encodeURIComponent(upsertError.message)}`, request.url)
      );
    }

    return NextResponse.redirect(new URL("/settings?google=connected", request.url));
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`/settings?google=error&message=${encodeURIComponent(String(err))}`, request.url)
    );
  }
}
