import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  findFolderByName,
  listFolderFilesRecursive,
  exportFileContent,
} from "@/lib/integrations/google-client";
import { createHash } from "crypto";
import { verifyRequest } from "@/lib/auth/session";

const TARGET_FOLDERS = ["Finances", "Operations"];

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
    let totalRecords = 0;

    for (const folderName of TARGET_FOLDERS) {
      const folderId = await findFolderByName(folderName);
      if (!folderId) {
        console.warn(`Google Drive folder "${folderName}" not found, skipping`);
        continue;
      }

      const files = await listFolderFilesRecursive(folderId, folderName);

      for (const file of files) {
        // Check if document already exists
        const { data: existing } = await supabase
          .from("documents")
          .select("id, content_hash")
          .eq("external_id", file.id)
          .single();

        // Skip if unchanged (compare md5Checksum for native files, modifiedTime for Google Docs)
        const fileHash = file.md5Checksum || file.modifiedTime || "";
        if (existing?.content_hash === fileHash) continue;

        // Export content
        const content = await exportFileContent(file.id, file.mimeType);
        const contentHash = file.md5Checksum || createHash("md5").update(content).digest("hex");

        await supabase.from("documents").upsert(
          {
            source: "google_drive",
            external_id: file.id,
            title: file.name,
            mime_type: file.mimeType,
            content,
            content_hash: contentHash,
            metadata: { folder: folderName, path: file.path },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        );
        totalRecords++;
      }
    }

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

    console.error("Google Drive sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
