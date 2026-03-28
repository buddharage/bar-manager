import { NextRequest, NextResponse } from "next/server";
import { generateReorderSuggestions } from "@/lib/ai/agent";

export async function POST(request: NextRequest) {
  // Verify cron secret or allow from dashboard
  const authHeader = request.headers.get("authorization");
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // Also allow requests from the app itself (no auth needed for same-origin)
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
