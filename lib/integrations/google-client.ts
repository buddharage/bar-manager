// Google Drive + Gmail API Client
// OAuth2 Authorization Code flow with offline access for refresh tokens
// Follows the QBO client pattern (lib/integrations/qbo-client.ts)

import { createServerClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ============================================================
// Token Cache — avoids DB lookup on every Google API call
// ============================================================

let _cachedTokens: GoogleTokens | null = null;
let _cacheExpiry = 0;

/** Reset the in-memory token cache (call after sync completes) */
export function resetTokenCache(): void {
  _cachedTokens = null;
  _cacheExpiry = 0;
}

// ============================================================
// OAuth2 Flow
// ============================================================

export function getAuthorizationUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: crypto.randomUUID(),
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token refresh failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Google doesn't return a new refresh token
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function getValidTokens(): Promise<GoogleTokens> {
  // Return cached tokens if still valid
  if (_cachedTokens && Date.now() < _cacheExpiry) {
    return _cachedTokens;
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_tokens")
    .single();

  if (!data) {
    throw new Error("Google not connected — no tokens found in settings");
  }

  let tokens = data.value as GoogleTokens;

  // Refresh if expired (with 60s buffer)
  if (Date.now() >= tokens.expires_at - 60_000) {
    tokens = await refreshAccessToken(tokens.refresh_token);
    await supabase
      .from("settings")
      .upsert({ key: "google_tokens", value: tokens as unknown as Record<string, unknown>, updated_at: new Date().toISOString() });
  }

  // Cache for 4 minutes (tokens are valid for ~1 hour)
  _cachedTokens = tokens;
  _cacheExpiry = Date.now() + 4 * 60_000;

  return tokens;
}

async function googleFetch<T>(url: string): Promise<T> {
  const tokens = await getValidTokens();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API ${url}: ${response.status} ${text}`);
  }

  return response.json();
}

async function googleFetchRaw(url: string): Promise<string> {
  const tokens = await getValidTokens();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API ${url}: ${response.status} ${text}`);
  }

  return response.text();
}

async function googleFetchBuffer(url: string): Promise<Buffer> {
  const tokens = await getValidTokens();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API ${url}: ${response.status} ${text}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ============================================================
// Google Drive
// ============================================================

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string;
  parents?: string[];
  modifiedTime?: string;
}

interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

/** Returns true for Google-native file types that lack an md5Checksum */
export function isGoogleNativeType(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}

export async function findFolderByName(name: string): Promise<string | null> {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const data = await googleFetch<DriveFileList>(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
  );
  return data.files[0]?.id ?? null;
}

export async function listFolderFiles(
  folderId: string,
  pageToken?: string
): Promise<DriveFileList> {
  const query = `'${folderId}' in parents and trashed=false`;
  let url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,md5Checksum,parents,modifiedTime),nextPageToken&pageSize=100`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return googleFetch<DriveFileList>(url);
}

/**
 * Recursively list all files in a folder and its subfolders.
 * Optionally collects all discovered folder IDs into the provided Set
 * (used to build a lookup table for the Changes API).
 */
export async function listFolderFilesRecursive(
  folderId: string,
  path: string,
  discoveredFolderIds?: Set<string>
): Promise<Array<DriveFile & { path: string }>> {
  const results: Array<DriveFile & { path: string }> = [];
  let pageToken: string | undefined;

  discoveredFolderIds?.add(folderId);

  do {
    const page = await listFolderFiles(folderId, pageToken);
    for (const file of page.files) {
      const filePath = `${path}/${file.name}`;
      if (file.mimeType === "application/vnd.google-apps.folder") {
        discoveredFolderIds?.add(file.id);
        const children = await listFolderFilesRecursive(file.id, filePath, discoveredFolderIds);
        results.push(...children);
      } else {
        results.push({ ...file, path: filePath });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return results;
}

/** Export file content as plain text based on MIME type */
export async function exportFileContent(
  fileId: string,
  mimeType: string
): Promise<string> {
  // Google Docs → plain text
  if (mimeType === "application/vnd.google-apps.document") {
    return googleFetchRaw(
      `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/plain`
    );
  }

  // Google Sheets → CSV
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return googleFetchRaw(
      `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/csv`
    );
  }

  // Google Slides → plain text
  if (mimeType === "application/vnd.google-apps.presentation") {
    return googleFetchRaw(
      `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/plain`
    );
  }

  // PDFs → extract text via AI
  if (mimeType === "application/pdf") {
    return extractPdfText(fileId);
  }

  // Plain text / CSV / other text formats → download directly
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv"
  ) {
    return googleFetchRaw(
      `${DRIVE_API_BASE}/files/${fileId}?alt=media`
    );
  }

  // Unsupported format — return a placeholder
  return `[Unsupported file format: ${mimeType}]`;
}

/** Extract text from a PDF using Anthropic Claude */
async function extractPdfText(fileId: string): Promise<string> {
  const pdfBuffer = await googleFetchBuffer(
    `${DRIVE_API_BASE}/files/${fileId}?alt=media`
  );

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBuffer.toString("base64"),
      },
    },
    "Extract all text content from this PDF. Return only the extracted text, preserving the original structure as much as possible. Do not summarize or interpret.",
  ]);

  return result.response.text();
}

// ============================================================
// Drive Changes API — incremental sync
// ============================================================

interface DriveChange {
  type: string;
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

interface DriveChangeList {
  changes: DriveChange[];
  newStartPageToken?: string;
  nextPageToken?: string;
}

/** Get the initial page token for the Drive Changes API */
export async function getChangesStartPageToken(): Promise<string> {
  const data = await googleFetch<{ startPageToken: string }>(
    `${DRIVE_API_BASE}/changes/startPageToken`
  );
  return data.startPageToken;
}

/** List changes since a given page token. Returns changed files and a new token. */
export async function listDriveChanges(
  pageToken: string
): Promise<DriveChangeList> {
  return googleFetch<DriveChangeList>(
    `${DRIVE_API_BASE}/changes?pageToken=${pageToken}&fields=changes(type,fileId,removed,file(id,name,mimeType,md5Checksum,parents,modifiedTime)),newStartPageToken,nextPageToken&pageSize=100&includeRemoved=true`
  );
}

// ============================================================
// Gmail
// ============================================================

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayload;
  internalDate?: string;
}

interface GmailPayload {
  mimeType: string;
  headers: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
}

interface GmailSearchResult {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export async function searchMessages(
  query: string,
  pageToken?: string
): Promise<GmailSearchResult> {
  let url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=50`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return googleFetch<GmailSearchResult>(url);
}

export async function getMessageContent(
  messageId: string
): Promise<{ subject: string; from: string; to: string; date: string; body: string; labels: string[]; threadId: string }> {
  const msg = await googleFetch<GmailMessage>(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`
  );

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const body = extractBody(msg.payload);

  return {
    subject: getHeader("Subject"),
    from: getHeader("From"),
    to: getHeader("To"),
    date: getHeader("Date"),
    body,
    labels: msg.labelIds || [],
    threadId: msg.threadId,
  };
}

// ============================================================
// Gmail History API — incremental sync
// ============================================================

interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

interface GmailHistoryRecord {
  id: string;
  messagesAdded?: Array<{
    message: { id: string; threadId: string; labelIds?: string[] };
  }>;
}

interface GmailHistoryList {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}

/** Get the Gmail profile including the current historyId */
export async function getGmailProfile(): Promise<GmailProfile> {
  return googleFetch<GmailProfile>(`${GMAIL_API_BASE}/profile`);
}

/** List history events (new messages) since a given historyId */
export async function listGmailHistory(
  startHistoryId: string,
  pageToken?: string
): Promise<GmailHistoryList> {
  let url = `${GMAIL_API_BASE}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return googleFetch<GmailHistoryList>(url);
}

// ============================================================
// Helpers
// ============================================================

/** Recursively extract plain text body from Gmail message payload */
function extractBody(payload?: GmailPayload): string {
  if (!payload) return "";

  // Prefer text/plain
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Check parts recursively
  if (payload.parts) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Second pass: fall back to text/html with tag stripping
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return stripHtml(html);
      }
    }
    // Recurse into multipart
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Last resort: HTML body at top level
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    return stripHtml(html);
  }

  return "";
}

/** Simple HTML tag stripping */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Run async tasks in parallel with a concurrency limit */
export async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<Array<{ status: "ok"; value: R } | { status: "error"; error: unknown }>> {
  const results: Array<{ status: "ok"; value: R } | { status: "error"; error: unknown }> = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(processor));
    for (const s of settled) {
      results.push(
        s.status === "fulfilled"
          ? { status: "ok", value: s.value }
          : { status: "error", error: s.reason }
      );
    }
  }

  return results;
}

export type { DriveFile, DriveChange, GoogleTokens, GmailMessage };
