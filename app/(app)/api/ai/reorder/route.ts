/**
 * POST /api/ai/reorder
 *
 * Generates AI-powered reorder suggestions for low-stock ingredients.
 * Accepts two auth modes:
 *   1. Bearer token (CRON_SECRET) — for GitHub Actions cron triggers
 *   2. Same-origin check — for requests from the dashboard UI
 */
import { NextRequest, NextResponse } from "next/server";
import { generateReorderSuggestions } from "@/lib/ai/agent";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const origin = request.headers.get("origin");
  const isSameOrigin = origin && (origin.includes("localhost") || origin.includes("vercel.app"));

  if (!isAuthorized && !isSameOrigin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const suggestions = await generateReorderSuggestions();
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Reorder suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions", details: String(error) },
      { status: 500 }
    );
  }
}
