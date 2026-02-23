import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { searchMessages, getMessageContent } from "@/lib/integrations/google-client";

const GMAIL_SEARCH_QUERY =
  'subject:(receipt OR invoice OR "order confirmation" OR "order status") newer_than:30d';

// POST /api/sync/gmail — sync Gmail receipts, invoices, and order emails
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "gmail", status: "started" })
    .select()
    .single();

  try {
    let totalRecords = 0;
    let pageToken: string | undefined;

    do {
      const searchResult = await searchMessages(GMAIL_SEARCH_QUERY, pageToken);
      const messages = searchResult.messages || [];

      for (const msg of messages) {
        // Skip if already synced
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("external_id", msg.id)
          .single();

        if (existing) continue;

        const content = await getMessageContent(msg.id);

        await supabase.from("documents").upsert(
          {
            source: "gmail",
            external_id: msg.id,
            title: content.subject || "(no subject)",
            mime_type: "message/rfc822",
            content: content.body,
            metadata: {
              from: content.from,
              to: content.to,
              date: content.date,
              subject: content.subject,
              labels: content.labels,
              thread_id: content.threadId,
            },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        );
        totalRecords++;
      }

      pageToken = searchResult.nextPageToken;
    } while (pageToken);

    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        records_synced: totalRecords,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLog!.id);

    return NextResponse.json({ success: true, records_synced: totalRecords });
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

    console.error("Gmail sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
