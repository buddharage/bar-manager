import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  searchMessages,
  getMessageContent,
  getGmailProfile,
  listGmailHistory,
  resetTokenCache,
  processInBatches,
} from "@/lib/integrations/google-client";
import { verifyRequest } from "@/lib/auth/session";

const GMAIL_SEARCH_QUERY =
  'subject:(receipt OR invoice OR "order confirmation" OR "order status") newer_than:30d';

const MESSAGE_FETCH_CONCURRENCY = 5;

// ============================================================
// Settings helpers — sync cursors stored in the `settings` table
// ============================================================

interface GmailSyncCursor {
  historyId: string;
}

async function loadGmailCursor(
  supabase: ReturnType<typeof createServerClient>
): Promise<GmailSyncCursor | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "gmail_sync_cursor")
    .single();
  return (data?.value as GmailSyncCursor) ?? null;
}

async function saveGmailCursor(
  supabase: ReturnType<typeof createServerClient>,
  cursor: GmailSyncCursor
): Promise<void> {
  await supabase.from("settings").upsert({
    key: "gmail_sync_cursor",
    value: cursor as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
}

// ============================================================
// Batch DB helpers
// ============================================================

/** Load all existing Gmail document external_ids into a Set */
async function loadExistingMessageIds(
  supabase: ReturnType<typeof createServerClient>
): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from("documents")
      .select("external_id")
      .eq("source", "gmail")
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    for (const row of data) {
      ids.add(row.external_id);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

// ============================================================
// Core sync logic
// ============================================================

interface SyncResult {
  upserted: number;
  skipped: number;
  method: "incremental" | "full_search";
}

/** Fetch content and upsert a batch of new message IDs */
async function syncMessages(
  messageIds: string[],
  supabase: ReturnType<typeof createServerClient>
): Promise<number> {
  let upserted = 0;

  await processInBatches(
    messageIds,
    async (msgId) => {
      const content = await getMessageContent(msgId);

      await supabase.from("documents").upsert(
        {
          source: "gmail",
          external_id: msgId,
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
      upserted++;
    },
    MESSAGE_FETCH_CONCURRENCY
  );

  return upserted;
}

/**
 * INCREMENTAL SYNC — uses the Gmail History API.
 * Only fetches messages that arrived since the last historyId.
 * Returns null if the historyId is too old (404), caller falls back to full search.
 */
async function incrementalSync(
  cursor: GmailSyncCursor,
  existingIds: Set<string>,
  supabase: ReturnType<typeof createServerClient>
): Promise<SyncResult | null> {
  const newMessageIds: string[] = [];

  try {
    let pageToken: string | undefined;

    do {
      const result = await listGmailHistory(cursor.historyId, pageToken);
      const records = result.history || [];

      for (const record of records) {
        const added = record.messagesAdded || [];
        for (const entry of added) {
          const msgId = entry.message.id;
          // Skip if already in DB
          if (existingIds.has(msgId)) continue;
          // Deduplicate within this batch
          if (!newMessageIds.includes(msgId)) {
            newMessageIds.push(msgId);
          }
        }
      }

      pageToken = result.nextPageToken;
    } while (pageToken);
  } catch (error: unknown) {
    // 404 = historyId too old, need full search
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    throw error;
  }

  // The History API returns ALL new messages, not just receipts/invoices.
  // We need to filter them. Fetch metadata and check subjects.
  // For efficiency, we do this during the content fetch — messages with
  // non-matching subjects just won't produce useful training data but
  // are still potentially relevant. A pragmatic filter: fetch content,
  // check if subject matches our criteria, skip if not.
  const relevantIds: string[] = [];
  const subjectPattern =
    /receipt|invoice|order confirmation|order status/i;

  // Fetch message headers in parallel to filter
  await processInBatches(
    newMessageIds,
    async (msgId) => {
      const content = await getMessageContent(msgId);
      if (subjectPattern.test(content.subject)) {
        relevantIds.push(msgId);
        // Since we already fetched the content, upsert it directly
        await supabase.from("documents").upsert(
          {
            source: "gmail",
            external_id: msgId,
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
      }
    },
    MESSAGE_FETCH_CONCURRENCY
  );

  // Save updated cursor
  const profile = await getGmailProfile();
  await saveGmailCursor(supabase, { historyId: profile.historyId });

  return {
    upserted: relevantIds.length,
    skipped: newMessageIds.length - relevantIds.length,
    method: "incremental",
  };
}

/**
 * FULL SEARCH — searches Gmail with the query filter.
 * Used on first sync or when the History API historyId has expired.
 */
async function fullSearch(
  existingIds: Set<string>,
  supabase: ReturnType<typeof createServerClient>
): Promise<SyncResult> {
  const newMessageIds: string[] = [];
  let pageToken: string | undefined;

  // Collect all matching message IDs, skipping already-synced ones
  do {
    const searchResult = await searchMessages(GMAIL_SEARCH_QUERY, pageToken);
    const messages = searchResult.messages || [];

    for (const msg of messages) {
      if (!existingIds.has(msg.id)) {
        newMessageIds.push(msg.id);
      }
    }

    pageToken = searchResult.nextPageToken;
  } while (pageToken);

  const skipped = existingIds.size; // all previously synced messages were skipped

  // Fetch content and upsert new messages in parallel
  const upserted = await syncMessages(newMessageIds, supabase);

  // Save cursor for future incremental syncs
  const profile = await getGmailProfile();
  await saveGmailCursor(supabase, { historyId: profile.historyId });

  return { upserted, skipped, method: "full_search" };
}

// ============================================================
// Route handler
// ============================================================

// POST /api/sync/gmail — sync Gmail receipts, invoices, and order emails
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "gmail", status: "started" })
    .select()
    .single();

  try {
    // Load existing message IDs and cursor in parallel
    const [existingIds, cursor] = await Promise.all([
      loadExistingMessageIds(supabase),
      loadGmailCursor(supabase),
    ]);

    let result: SyncResult;

    if (cursor) {
      // Try incremental sync first
      const incremental = await incrementalSync(cursor, existingIds, supabase);
      if (incremental) {
        result = incremental;
      } else {
        // historyId expired — fall back to full search
        console.log("Gmail historyId expired, falling back to full search");
        result = await fullSearch(existingIds, supabase);
      }
    } else {
      // No cursor — first sync, do a full search
      result = await fullSearch(existingIds, supabase);
    }

    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        records_synced: result.upserted,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLog!.id);

    return NextResponse.json({
      success: true,
      method: result.method,
      records_synced: result.upserted,
      records_skipped: result.skipped,
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

    console.error("Gmail sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  } finally {
    resetTokenCache();
  }
}
