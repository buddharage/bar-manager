import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/integrations/google-client";

// GET /api/auth/google → redirect to Google consent screen
export async function GET() {
  const url = getAuthorizationUrl();
  return NextResponse.redirect(url);
}
