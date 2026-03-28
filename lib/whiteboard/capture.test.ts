/**
 * Tests for whiteboard camera capture + Gemini OCR pipeline.
 *
 * Requirements under test:
 *   1. Camera snapshot is fetched and sent to Gemini for OCR
 *   2. Extracted text is compared with previous snapshot for deduplication
 *   3. Blank whiteboards are treated as unchanged (no notification)
 *   4. Results are stored in the database
 *   5. Errors from camera or missing config are handled
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Boundary mock: fetch (camera HTTP snapshot)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function cameraResponse(imageBytes = "fake-jpeg-bytes") {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: () => Promise.resolve(Buffer.from(imageBytes)),
    headers: { get: (name: string) => (name === "content-type" ? "image/jpeg" : null) },
  };
}

function cameraError(status = 500) {
  return {
    ok: false,
    status,
    statusText: "Internal Server Error",
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: { get: () => null },
  };
}

// ---------------------------------------------------------------------------
// Boundary mock: Gemini AI
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

// ---------------------------------------------------------------------------
// Boundary mock: Supabase
// ---------------------------------------------------------------------------

let mockPreviousSnapshot: { extracted_text: string } | null;
let mockInsertResult: { data: { id: number } | null; error: { message: string } | null };

function createChainableMock(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "not", "in", "gte", "limit", "order", "range", "delete", "insert"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "whiteboard_snapshots") {
        // The module calls .from("whiteboard_snapshots") twice:
        // 1st: select previous snapshot
        // 2nd: insert new snapshot
        const selectChain = createChainableMock({ data: mockPreviousSnapshot, error: null });
        const insertChain = createChainableMock(mockInsertResult);

        // Return an object that handles both select and insert flows
        const mock: Record<string, unknown> = {};
        for (const m of ["eq", "neq", "not", "in", "gte", "limit", "order", "range", "delete"]) {
          mock[m] = vi.fn().mockReturnValue(mock);
        }
        mock.select = vi.fn().mockReturnValue(mock);
        mock.maybeSingle = vi.fn().mockResolvedValue({ data: mockPreviousSnapshot, error: null });
        mock.single = vi.fn().mockResolvedValue(mockInsertResult);
        mock.insert = vi.fn().mockReturnValue(mock);
        mock.then = (resolve: (v: unknown) => void) => resolve({ data: mockPreviousSnapshot, error: null });
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import real code after mocks
// ---------------------------------------------------------------------------

const { captureAndAnalyzeWhiteboard } = await import("./capture");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function geminiResponse(text: string) {
  return {
    response: {
      text: () => text,
    },
  };
}

const WHITEBOARD_OCR = `--- RAW TEXT ---
Order: Tito's Vodka (2 cases)
Order: Lime juice (1 case)
Special: Spicy Margarita $14
--- SUMMARY ---
- Orders needed: Tito's Vodka (2 cases), Lime juice (1 case)
- Special: Spicy Margarita $14`;

const BLANK_WHITEBOARD = `--- RAW TEXT ---
BLANK
--- SUMMARY ---
No content visible`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Whiteboard capture: camera → Gemini OCR → store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviousSnapshot = null;
    mockInsertResult = { data: { id: 1 }, error: null };
    process.env.CAMERA_SNAPSHOT_URL = "https://camera.example.com/snap";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("captures snapshot, extracts text via Gemini, and stores result", async () => {
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    const result = await captureAndAnalyzeWhiteboard("morning");

    expect(result.extractedText).toContain("Tito's Vodka");
    expect(result.extractedText).toContain("Lime juice");
    expect(result.summary).toContain("Orders needed");
    expect(result.changed).toBe(true);
    expect(result.snapshotId).toBe(1);
  });

  it("sends camera image to Gemini as base64 inline data", async () => {
    mockFetch.mockResolvedValueOnce(cameraResponse("test-image-data"));
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    await captureAndAnalyzeWhiteboard("evening");

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs[0].inlineData.mimeType).toBe("image/jpeg");
    expect(callArgs[0].inlineData.data).toBe(
      Buffer.from("test-image-data").toString("base64"),
    );
  });

  it("marks as unchanged when text matches previous snapshot", async () => {
    mockPreviousSnapshot = {
      extracted_text: "Order: Tito's Vodka (2 cases)\nOrder: Lime juice (1 case)\nSpecial: Spicy Margarita $14",
    };
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    const result = await captureAndAnalyzeWhiteboard("evening");

    expect(result.changed).toBe(false);
  });

  it("detects change when text differs from previous snapshot", async () => {
    mockPreviousSnapshot = {
      extracted_text: "Something completely different",
    };
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    const result = await captureAndAnalyzeWhiteboard("night");

    expect(result.changed).toBe(true);
  });

  it("treats blank whiteboard as unchanged (no false notification)", async () => {
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(BLANK_WHITEBOARD));

    const result = await captureAndAnalyzeWhiteboard("morning");

    expect(result.changed).toBe(false);
    expect(result.extractedText).toBe("BLANK");
  });

  it("treats blank whiteboard as unchanged even with no previous snapshot", async () => {
    mockPreviousSnapshot = null;
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(BLANK_WHITEBOARD));

    const result = await captureAndAnalyzeWhiteboard("evening");

    // First-ever capture but blank → should NOT be marked changed
    expect(result.changed).toBe(false);
  });
});

describe("Whiteboard capture: error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviousSnapshot = null;
    mockInsertResult = { data: { id: 1 }, error: null };
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("throws when CAMERA_SNAPSHOT_URL is not set", async () => {
    delete process.env.CAMERA_SNAPSHOT_URL;

    await expect(captureAndAnalyzeWhiteboard("morning")).rejects.toThrow(
      "CAMERA_SNAPSHOT_URL is not configured",
    );
  });

  it("throws when camera returns non-200 response", async () => {
    process.env.CAMERA_SNAPSHOT_URL = "https://camera.example.com/snap";
    mockFetch.mockResolvedValueOnce(cameraError(503));

    await expect(captureAndAnalyzeWhiteboard("morning")).rejects.toThrow(
      "Camera returned 503",
    );
  });

  it("throws when database insert fails", async () => {
    process.env.CAMERA_SNAPSHOT_URL = "https://camera.example.com/snap";
    mockInsertResult = { data: null, error: { message: "insert failed" } };
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    await expect(captureAndAnalyzeWhiteboard("morning")).rejects.toThrow(
      "Failed to store snapshot: insert failed",
    );
  });
});

describe("Whiteboard capture: Gemini response parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviousSnapshot = null;
    mockInsertResult = { data: { id: 1 }, error: null };
    process.env.CAMERA_SNAPSHOT_URL = "https://camera.example.com/snap";
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("parses structured response with RAW TEXT and SUMMARY sections", async () => {
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(WHITEBOARD_OCR));

    const result = await captureAndAnalyzeWhiteboard("morning");

    expect(result.extractedText).toContain("Tito's Vodka");
    expect(result.summary).toContain("Orders needed");
    // Raw text should not include summary
    expect(result.extractedText).not.toContain("Orders needed");
  });

  it("falls back to full response when parsing fails", async () => {
    const unstructured = "The whiteboard says: order more vodka and limes";
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(unstructured));

    const result = await captureAndAnalyzeWhiteboard("morning");

    // Falls back to using the full response as both text and summary
    expect(result.extractedText).toBe(unstructured);
    expect(result.summary).toBe(unstructured);
  });

  it("normalizes whitespace when comparing text for deduplication", async () => {
    mockPreviousSnapshot = {
      extracted_text: "Order:   Vodka\n\n  Limes",
    };
    mockFetch.mockResolvedValueOnce(cameraResponse());
    mockGenerateContent.mockResolvedValueOnce(
      geminiResponse("--- RAW TEXT ---\nOrder: Vodka\nLimes\n--- SUMMARY ---\nOrders: Vodka, Limes"),
    );

    const result = await captureAndAnalyzeWhiteboard("morning");

    // Same content with different whitespace → unchanged
    expect(result.changed).toBe(false);
  });
});
