import { GoogleGenerativeAI } from "@google/generative-ai";
import { createServerClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface CaptureResult {
  extractedText: string;
  summary: string;
  changed: boolean;
  snapshotId: number;
}

/**
 * Normalize text for comparison: lowercase, collapse whitespace, trim.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Capture a snapshot from the whiteboard camera, run Gemini vision OCR,
 * compare with previous snapshot, and store the result.
 */
export async function captureAndAnalyzeWhiteboard(
  scheduleLabel: "morning" | "evening" | "night",
): Promise<CaptureResult> {
  const cameraUrl = process.env.CAMERA_SNAPSHOT_URL;
  if (!cameraUrl) {
    throw new Error("CAMERA_SNAPSHOT_URL is not configured");
  }

  // 1. Fetch snapshot from camera
  const response = await fetch(cameraUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Camera returned ${response.status}: ${response.statusText}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const base64Image = imageBuffer.toString("base64");
  const contentType = response.headers.get("content-type") || "image/jpeg";

  // 2. Send to Gemini for OCR + analysis
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: contentType,
        data: base64Image,
      },
    },
    {
      text: `You are looking at a photo of a whiteboard in a Brooklyn cocktail bar.
Extract ALL text visible on the whiteboard exactly as written.
Then provide a brief structured summary.

Format your response as:
--- RAW TEXT ---
(all text exactly as written on the whiteboard)
--- SUMMARY ---
(organized bullet points: orders needed, specials, events, tasks, notes)

If the whiteboard is blank or unreadable, say "BLANK" under RAW TEXT and "No content visible" under SUMMARY.`,
    },
  ]);

  const aiResponse = result.response.text();

  // Parse the structured response
  const rawMatch = aiResponse.match(/---\s*RAW TEXT\s*---\s*([\s\S]*?)---\s*SUMMARY\s*---/i);
  const summaryMatch = aiResponse.match(/---\s*SUMMARY\s*---\s*([\s\S]*?)$/i);

  const extractedText = rawMatch?.[1]?.trim() || aiResponse;
  const summary = summaryMatch?.[1]?.trim() || extractedText;
  const isBlank = normalizeText(extractedText) === "blank";

  // 3. Check if content changed from previous snapshot
  const supabase = createServerClient();

  const { data: previous } = await supabase
    .from("whiteboard_snapshots")
    .select("extracted_text")
    .eq("status", "success")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const changed =
    !isBlank &&
    (!previous ||
      normalizeText(previous.extracted_text || "") !== normalizeText(extractedText));

  // 4. Store in database
  const { data: snapshot, error } = await supabase
    .from("whiteboard_snapshots")
    .insert({
      extracted_text: extractedText,
      summary,
      schedule_label: scheduleLabel,
      status: changed ? "success" : "no_change",
    })
    .select("id")
    .single();

  if (error || !snapshot) {
    throw new Error(`Failed to store snapshot: ${error?.message}`);
  }

  return {
    extractedText,
    summary,
    changed,
    snapshotId: snapshot.id,
  };
}
