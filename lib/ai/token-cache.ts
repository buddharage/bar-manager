// Token cache layer for AI — maximizes token efficiency by caching embeddings,
// RAG results, and tool call responses to eliminate redundant API calls.

// ============================================================
// Generic LRU Cache with TTL support
// ============================================================

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Delete first to reset position if key exists
    this.cache.delete(key);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }

    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================
// Embedding Cache — avoid re-embedding identical text
// ============================================================

// 200 entries, 30-minute TTL (embeddings are deterministic, safe to cache longer)
const embeddingCache = new LRUCache<string, number[]>(200, 30 * 60 * 1000);

/**
 * Normalize text for cache key generation.
 * Collapses whitespace so trivially different inputs hit the same cache entry.
 */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Get a cached embedding for the given text, or undefined if not cached.
 */
export function getCachedEmbedding(text: string): number[] | undefined {
  return embeddingCache.get(normalizeText(text));
}

/**
 * Store an embedding in the cache.
 */
export function setCachedEmbedding(text: string, embedding: number[]): void {
  embeddingCache.set(normalizeText(text), embedding);
}

// ============================================================
// RAG Context Cache — avoid redundant vector searches
// ============================================================

export interface CachedChunk {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  similarity: number;
  title?: string;
  folder?: string;
}

// 50 entries, 5-minute TTL (document data may change after syncs)
const ragCache = new LRUCache<string, CachedChunk[]>(50, 5 * 60 * 1000);

function ragCacheKey(query: string, limit: number, threshold: number): string {
  return `${normalizeText(query)}::${limit}::${threshold}`;
}

/**
 * Get cached RAG results for a query, or undefined if not cached.
 */
export function getCachedRAG(
  query: string,
  limit: number,
  threshold: number
): CachedChunk[] | undefined {
  return ragCache.get(ragCacheKey(query, limit, threshold));
}

/**
 * Store RAG results in the cache.
 */
export function setCachedRAG(
  query: string,
  limit: number,
  threshold: number,
  chunks: CachedChunk[]
): void {
  ragCache.set(ragCacheKey(query, limit, threshold), chunks);
}

// ============================================================
// Tool Result Cache — avoid redundant DB queries within a session
// ============================================================

// 100 entries, 60-second TTL (tool data is live, short cache only)
const toolCache = new LRUCache<string, unknown>(100, 60 * 1000);

function toolCacheKey(name: string, args: Record<string, unknown>): string {
  // Deterministic key: sort args keys for consistency
  const sortedArgs = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = args[k];
      return acc;
    }, {});
  return `${name}::${JSON.stringify(sortedArgs)}`;
}

/**
 * Get a cached tool result, or undefined if not cached.
 */
export function getCachedToolResult(
  name: string,
  args: Record<string, unknown>
): unknown | undefined {
  return toolCache.get(toolCacheKey(name, args));
}

/**
 * Store a tool result in the cache.
 */
export function setCachedToolResult(
  name: string,
  args: Record<string, unknown>,
  result: unknown
): void {
  // Only cache read-only tools (skip Gmail which is always live)
  if (name === "search_gmail") return;
  toolCache.set(toolCacheKey(name, args), result);
}

// ============================================================
// Token Usage Tracker — monitor costs across requests
// ============================================================

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedContentTokens: number;
  embeddingsCached: number;
  embeddingsComputed: number;
  toolCallsCached: number;
  toolCallsExecuted: number;
  ragCacheHit: boolean;
}

export function createTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedContentTokens: 0,
    embeddingsCached: 0,
    embeddingsComputed: 0,
    toolCallsCached: 0,
    toolCallsExecuted: 0,
    ragCacheHit: false,
  };
}

// ============================================================
// Cache stats — for monitoring / debugging
// ============================================================

export function getCacheStats() {
  return {
    embeddings: embeddingCache.size,
    rag: ragCache.size,
    tools: toolCache.size,
  };
}

export function clearAllCaches(): void {
  embeddingCache.clear();
  ragCache.clear();
  toolCache.clear();
}
