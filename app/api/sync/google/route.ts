import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  findFolderByName,
  listFolderFilesRecursive,
  exportFileContent,
  getChangesStartPageToken,
  listDriveChanges,
  resetTokenCache,
  processInBatches,
} from "@/lib/integrations/google-client";
import type { DriveFile } from "@/lib/integrations/google-client";
import { chunkDocument, embedTexts, replaceDocumentChunks } from "@/lib/ai/embeddings";
import { verifyRequest } from "@/lib/auth/session";

const TARGET_FOLDERS = ["Finances", "Operations"];
const CONTENT_FETCH_CONCURRENCY = 5;

// ============================================================
// Settings helpers — sync cursors stored in the `settings` table
// ============================================================

interface DriveSyncCursor {
  changesPageToken: string;
  folderIds: Record<string, string[]>; // folder name → [all sub-folder IDs in tree]
}

async function loadSyncCursor(
  supabase: ReturnType<typeof createServerClient>
): Promise<DriveSyncCursor | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "drive_sync_cursor")
    .single();
  return (data?.value as DriveSyncCursor) ?? null;
}

async function saveSyncCursor(
  supabase: ReturnType<typeof createServerClient>,
  cursor: DriveSyncCursor
): Promise<void> {
  await supabase.from("settings").upsert({
    key: "drive_sync_cursor",
    value: cursor as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
}

// ============================================================
// Hash helpers
// ============================================================

/** Compute the content hash that we store in the DB.
 *  - Native files (uploaded) use Google's md5Checksum
 *  - Google Docs/Sheets/Slides use modifiedTime (they have no md5) */
function fileContentHash(file: DriveFile): string {
  if (file.md5Checksum) return file.md5Checksum;
  return file.modifiedTime || "";
}

// ============================================================
// Batch DB helpers
// ============================================================

/** Load all existing Drive documents into a Map<external_id, content_hash> */
async function loadExistingDocs(
  supabase: ReturnType<typeof createServerClient>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from("documents")
      .select("external_id, content_hash")
      .eq("source", "google_drive")
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    for (const row of data) {
      map.set(row.external_id, row.content_hash ?? "");
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}

// ============================================================
// Core sync logic
// ============================================================

interface SyncResult {
  upserted: number;
  embedded: number;
  deleted: number;
  skipped: number;
  method: "incremental" | "full_scan";
}

/** Process a batch of files: skip unchanged, export content, upsert, chunk + embed. */
async function syncFiles(
  files: Array<DriveFile & { path: string; folder: string }>,
  existingDocs: Map<string, string>,
  supabase: ReturnType<typeof createServerClient>
): Promise<{ upserted: number; embedded: number; skipped: number }> {
  const changed = files.filter((file) => {
    const hash = fileContentHash(file);
    return existingDocs.get(file.id) !== hash;
  });

  const skipped = files.length - changed.length;
  if (changed.length === 0) return { upserted: 0, embedded: 0, skipped };

  let upserted = 0;
  let embedded = 0;

  await processInBatches(
    changed,
    async (file) => {
      // 1. Export content from Google Drive
      const content = await exportFileContent(file.id, file.mimeType);
      const hash = fileContentHash(file);

      // 2. Upsert the document and get the DB row ID
      const { data: row } = await supabase
        .from("documents")
        .upsert(
          {
            source: "google_drive",
            external_id: file.id,
            title: file.name,
            mime_type: file.mimeType,
            content,
            content_hash: hash,
            metadata: { folder: file.folder, path: file.path },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        )
        .select("id")
        .single();

      upserted++;

      // 3. Chunk the content and generate vector embeddings
      if (row) {
        try {
          const chunks = chunkDocument(file.name, content);
          if (chunks.length > 0) {
            const embeddings = await embedTexts(chunks.map((c) => c.content));
            await replaceDocumentChunks(row.id, chunks, embeddings);
            embedded++;
          }
        } catch (err) {
          // Embedding failure shouldn't block the sync — log and continue
          console.error(`Failed to embed ${file.name}:`, err);
        }
      }
    },
    CONTENT_FETCH_CONCURRENCY
  );

  return { upserted, embedded, skipped };
}

/**
 * Backfill: generate chunks + embeddings for any documents that were
 * synced before the vector pipeline existed (no rows in document_chunks).
 */
async function backfillMissingEmbeddings(
  supabase: ReturnType<typeof createServerClient>
): Promise<number> {
  // Find documents with no chunks
  const { data: docsWithoutChunks } = await supabase
    .from("documents")
    .select("id, title, content")
    .eq("source", "google_drive")
    .not("content", "is", null)
    .order("id");

  if (!docsWithoutChunks || docsWithoutChunks.length === 0) return 0;

  // Check which ones actually have chunks already
  const { data: chunked } = await supabase
    .from("document_chunks")
    .select("document_id")
    .in(
      "document_id",
      docsWithoutChunks.map((d: { id: number }) => d.id)
    );

  const chunkedIds = new Set((chunked || []).map((c: { document_id: number }) => c.document_id));
  const needsEmbedding = docsWithoutChunks.filter((d: { id: number }) => !chunkedIds.has(d.id));

  if (needsEmbedding.length === 0) return 0;

  let count = 0;

  await processInBatches(
    needsEmbedding as Array<{ id: number; title: string; content: string }>,
    async (doc) => {
      try {
        const chunks = chunkDocument(doc.title, doc.content);
        if (chunks.length > 0) {
          const embeddings = await embedTexts(chunks.map((c) => c.content));
          await replaceDocumentChunks(doc.id, chunks, embeddings);
          count++;
        }
      } catch (err) {
        console.error(`Backfill embedding failed for doc ${doc.id}:`, err);
      }
    },
    3 // Lower concurrency for backfill to avoid rate limits
  );

  return count;
}

/**
 * INCREMENTAL SYNC — uses the Drive Changes API.
 * Only processes files that changed since the last sync.
 * Returns null if the saved page token is stale (caller should fall back to full scan).
 */
async function incrementalSync(
  cursor: DriveSyncCursor,
  existingDocs: Map<string, string>,
  supabase: ReturnType<typeof createServerClient>
): Promise<SyncResult | null> {
  const knownFolderIds = new Set<string>();
  const folderIdToName = new Map<string, string>();

  for (const folderName of TARGET_FOLDERS) {
    const ids = cursor.folderIds[folderName] || [];
    for (const id of ids) {
      knownFolderIds.add(id);
      folderIdToName.set(id, folderName);
    }
  }

  let pageToken = cursor.changesPageToken;
  let newStartPageToken: string | undefined;
  const changedFiles: Array<DriveFile & { path: string; folder: string }> = [];
  const removedFileIds: string[] = [];

  try {
    do {
      const result = await listDriveChanges(pageToken);

      for (const change of result.changes) {
        if (change.removed) {
          if (existingDocs.has(change.fileId)) {
            removedFileIds.push(change.fileId);
          }
          continue;
        }

        if (!change.file) continue;

        const parentId = change.file.parents?.[0];
        if (!parentId || !knownFolderIds.has(parentId)) continue;

        if (change.file.mimeType === "application/vnd.google-apps.folder") {
          knownFolderIds.add(change.file.id);
          folderIdToName.set(change.file.id, folderIdToName.get(parentId) || "");
          continue;
        }

        const folderName = folderIdToName.get(parentId) || "";
        changedFiles.push({
          ...change.file,
          path: `${folderName}/${change.file.name}`,
          folder: folderName,
        });
      }

      pageToken = result.nextPageToken || "";
      newStartPageToken = result.newStartPageToken;
    } while (pageToken);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("410")) {
      return null;
    }
    throw error;
  }

  // Delete removed files from DB (cascade deletes their chunks too)
  let deleted = 0;
  if (removedFileIds.length > 0) {
    await supabase
      .from("documents")
      .delete()
      .eq("source", "google_drive")
      .in("external_id", removedFileIds);
    deleted = removedFileIds.length;
  }

  const { upserted, embedded, skipped } = await syncFiles(changedFiles, existingDocs, supabase);

  // Save updated cursor
  const updatedFolderIds: Record<string, string[]> = {};
  for (const folderName of TARGET_FOLDERS) {
    updatedFolderIds[folderName] = [
      ...new Set([
        ...(cursor.folderIds[folderName] || []),
        ...[...knownFolderIds].filter((id) => folderIdToName.get(id) === folderName),
      ]),
    ];
  }

  await saveSyncCursor(supabase, {
    changesPageToken: newStartPageToken || cursor.changesPageToken,
    folderIds: updatedFolderIds,
  });

  return { upserted, embedded, deleted, skipped, method: "incremental" };
}

/**
 * FULL SCAN — lists all files recursively, syncs changed ones, removes stale docs.
 * Used on first sync or when the Changes API token has expired.
 */
async function fullScan(
  existingDocs: Map<string, string>,
  supabase: ReturnType<typeof createServerClient>
): Promise<SyncResult> {
  const allFiles: Array<DriveFile & { path: string; folder: string }> = [];
  const seenExternalIds = new Set<string>();
  const folderIds: Record<string, string[]> = {};

  for (const folderName of TARGET_FOLDERS) {
    const folderId = await findFolderByName(folderName);
    if (!folderId) {
      console.warn(`Google Drive folder "${folderName}" not found, skipping`);
      continue;
    }

    const discoveredIds = new Set<string>();
    const files = await listFolderFilesRecursive(folderId, folderName, discoveredIds);

    folderIds[folderName] = [...discoveredIds];

    for (const file of files) {
      allFiles.push({ ...file, folder: folderName });
      seenExternalIds.add(file.id);
    }
  }

  const { upserted, embedded, skipped } = await syncFiles(allFiles, existingDocs, supabase);

  // Remove stale documents (cascade deletes chunks too)
  let deleted = 0;
  const staleIds = [...existingDocs.keys()].filter((id) => !seenExternalIds.has(id));
  if (staleIds.length > 0) {
    await supabase
      .from("documents")
      .delete()
      .eq("source", "google_drive")
      .in("external_id", staleIds);
    deleted = staleIds.length;
  }

  const changesPageToken = await getChangesStartPageToken();
  await saveSyncCursor(supabase, { changesPageToken, folderIds });

  return { upserted, embedded, deleted, skipped, method: "full_scan" };
}

// ============================================================
// Route handler
// ============================================================

// POST /api/sync/google — sync Google Drive files from target folders
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "google_drive", status: "started" })
    .select()
    .single();

  try {
    const [existingDocs, cursor] = await Promise.all([
      loadExistingDocs(supabase),
      loadSyncCursor(supabase),
    ]);

    let result: SyncResult;

    if (cursor) {
      const incremental = await incrementalSync(cursor, existingDocs, supabase);
      if (incremental) {
        result = incremental;
      } else {
        console.log("Drive Changes token expired, falling back to full scan");
        result = await fullScan(existingDocs, supabase);
      }
    } else {
      result = await fullScan(existingDocs, supabase);
    }

    // Backfill embeddings for any documents synced before the vector pipeline
    const backfilled = await backfillMissingEmbeddings(supabase);

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
      records_embedded: result.embedded + backfilled,
      records_deleted: result.deleted,
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

    console.error("Google Drive sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  } finally {
    resetTokenCache();
  }
}
