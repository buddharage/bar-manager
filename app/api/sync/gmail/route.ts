import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/session";

// POST /api/sync/gmail — DEPRECATED: Gmail is now searched live by the AI agent.
// This endpoint is kept for backwards compatibility but does nothing.
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    message: "Gmail sync is no longer needed — emails are searched live via the Gmail API.",
    records_synced: 0,
  });
}
