import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { captureAndAnalyzeWhiteboard } from "@/lib/whiteboard/capture";
import { broadcastWhiteboardUpdate } from "@/lib/notifications/push";

/** Get current hour in America/New_York timezone. */
function getCurrentETHour(): number {
  const now = new Date();
  const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
  return parseInt(etTime, 10);
}

// Whiteboard camera sync — called by GitHub Actions cron (3x daily) or manual trigger
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Determine schedule label from current ET time
  const etHour = getCurrentETHour();
  const scheduleLabel: "morning" | "evening" | "night" =
    etHour < 14 ? "morning" : etHour < 20 ? "evening" : "night";

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "whiteboard", status: "started" })
    .select()
    .single();

  try {
    const result = await captureAndAnalyzeWhiteboard(scheduleLabel);

    // Only notify if whiteboard content changed
    if (result.changed) {
      await broadcastWhiteboardUpdate({
        title: `Whiteboard Update (${scheduleLabel})`,
        body: result.summary.slice(0, 200),
        url: "/whiteboard",
      });
    }

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          records_synced: 1,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({
      success: true,
      changed: result.changed,
      schedule: scheduleLabel,
      snapshot_id: result.snapshotId,
      summary: result.summary,
    });
  } catch (error) {
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "error",
          error: String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.error("Whiteboard sync error:", error);
    return NextResponse.json(
      { error: "Whiteboard capture failed", details: String(error) },
      { status: 500 },
    );
  }
}
