// Document chunking + Gemini vector embeddings + similarity search
// Used by the Drive sync pipeline (chunk & embed) and the chat agent (retrieve)

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createServerClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// ============================================================
// Chunking — split document content into overlapping pieces
// ============================================================

const CHUNK_TARGET_CHARS = 1500; // ~375 tokens
const CHUNK_OVERLAP_CHARS = 200; // ~50 tokens

export interface DocumentChunk {
  index: number;
  content: string;
}

/**
 * Split a document into overlapping chunks.
 * Prefaces each chunk with the document title for better embedding quality.
 */
export function chunkDocument(title: string, content: string): DocumentChunk[] {
  if (!content || content.trim().length === 0) return [];

  const prefix = `[${title}] `;
  const text = content.trim();

  // Small documents → single chunk
  if (text.length <= CHUNK_TARGET_CHARS) {
    return [{ index: 0, content: prefix + text }];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = start + CHUNK_TARGET_CHARS;

    if (end < text.length) {
      // Try to break at a paragraph boundary
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + CHUNK_TARGET_CHARS * 0.5) {
        end = paragraphBreak;
      } else {
        // Fall back to sentence boundary
        const sentenceBreak = text.lastIndexOf(". ", end);
        if (sentenceBreak > start + CHUNK_TARGET_CHARS * 0.5) {
          end = sentenceBreak + 1;
        }
      }
    } else {
      end = text.length;
    }

    chunks.push({
      index,
      content: prefix + text.slice(start, end).trim(),
    });

    // Reached the end of the document — no more chunks needed
    if (end >= text.length) break;

    index++;
    start = end - CHUNK_OVERLAP_CHARS;
    if (start < 0) start = 0;
  }

  return chunks;
}

// ============================================================
// Embedding — convert text into vectors via Gemini
// ============================================================

/**
 * Embed a single text string. Returns a 768-dimension vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

/**
 * Embed multiple texts in a single batch request.
 * Gemini supports up to 100 texts per batch.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];
  const batchSize = 100;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await embeddingModel.batchEmbedContents({
      requests: batch.map((text) => ({
        content: { role: "user", parts: [{ text }] },
        outputDimensionality: 768,
      })),
    });
    for (const emb of response.embeddings) {
      results.push(emb.values);
    }
  }

  return results;
}

// ============================================================
// Store — save chunks + embeddings to Supabase
// ============================================================

/**
 * Delete existing chunks for a document and insert new ones with embeddings.
 */
export async function replaceDocumentChunks(
  documentId: number,
  chunks: DocumentChunk[],
  embeddings: number[][]
): Promise<void> {
  const supabase = createServerClient();

  // Delete old chunks
  await supabase.from("document_chunks").delete().eq("document_id", documentId);

  if (chunks.length === 0) return;

  // Insert new chunks with embeddings
  const rows = chunks.map((chunk, i) => ({
    document_id: documentId,
    chunk_index: chunk.index,
    content: chunk.content,
    embedding: embeddings[i],
  }));

  // Insert in batches of 50 to stay within payload limits
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
  }
}

// ============================================================
// Search — find semantically similar chunks
// ============================================================

export interface ChunkMatch {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  similarity: number;
  // Joined from documents table
  title?: string;
  folder?: string;
}

/**
 * Embed a query and find the most similar document chunks.
 * Returns chunks with their similarity score and source document metadata.
 */
export async function findSimilarChunks(
  query: string,
  limit = 5,
  threshold = 0.3
): Promise<ChunkMatch[]> {
  const supabase = createServerClient();

  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error("Vector search failed:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Fetch document metadata for the matched chunks
  const docIds = [...new Set((data as ChunkMatch[]).map((d) => d.document_id))];
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, metadata")
    .in("id", docIds);

  const docMap = new Map<number, { title: string; folder?: string }>();
  for (const d of docs || []) {
    const doc = d as { id: number; title: string; metadata: Record<string, string> | null };
    docMap.set(doc.id, { title: doc.title, folder: doc.metadata?.folder });
  }

  return (data as ChunkMatch[]).map((chunk) => ({
    ...chunk,
    title: docMap.get(chunk.document_id)?.title,
    folder: docMap.get(chunk.document_id)?.folder,
  }));
}
