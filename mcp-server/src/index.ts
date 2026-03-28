/**
 * Bar Manager MCP Server
 *
 * Exposes Supabase bar-operations data (inventory, sales, recipes, employees,
 * gift cards, tax periods, documents) as MCP tools for Claude CLI.
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 * Optionally uses GEMINI_API_KEY for vector-based document search (falls back to
 * text search when unavailable or on error).
 *
 * Launched via start.sh which sources .env.local before running this file.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Helpers ──

/** Round to 2 decimal places (cents precision for dollar amounts). */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Generate a 768-dimensional embedding via Gemini for semantic search. */
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini embedding API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

// ── MCP Server ──

const server = new McpServer({
  name: "bar-manager",
  version: "1.0.0",
});

// ── Tool: query_inventory ──

server.tool(
  "query_inventory",
  "Get current inventory items with stock levels. Can filter by category or low-stock status.",
  {
    category: z.string().optional().describe("Filter by category (e.g., 'spirits', 'beer', 'wine', 'mixers')"),
    low_stock_only: z.boolean().optional().describe("If true, only return items where current_stock <= par_level"),
  },
  async ({ category, low_stock_only }) => {
    let query = supabase.from("inventory_items").select("*").order("name");

    if (category) {
      query = query.ilike("category", `%${category}%`);
    }
    if (low_stock_only) {
      query = query.not("par_level", "is", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const result =
      low_stock_only && data
        ? data.filter((item: { par_level: number | null; current_stock: number }) =>
            item.par_level !== null && item.par_level !== undefined && item.current_stock <= item.par_level
          )
        : data;

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: query_sales ──

server.tool(
  "query_sales",
  "Get daily sales data for a date range. Returns gross sales, net sales, tax collected, tips, and discounts.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    const { data, error } = await supabase
      .from("daily_sales")
      .select("*")
      .gte("date", start_date)
      .lte("date", end_date)
      .order("date");

    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_top_sellers ──

server.tool(
  "query_top_sellers",
  "Get top-selling menu items by quantity or revenue for a date range.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
    sort_by: z.enum(["quantity", "revenue"]).optional().describe("Sort by quantity or revenue (default: quantity)"),
    limit: z.number().optional().describe("Number of items to return (default 10)"),
  },
  async ({ start_date, end_date, sort_by, limit }) => {
    const { data, error } = await supabase
      .from("order_items")
      .select("name, quantity, revenue")
      .gte("date", start_date)
      .lte("date", end_date);

    if (error) throw error;

    const grouped = new Map<string, { quantity: number; revenue: number }>();
    for (const item of data || []) {
      const key = item.name;
      const existing = grouped.get(key) || { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity || 1;
      existing.revenue += item.revenue || 0;
      grouped.set(key, existing);
    }

    const sortField = sort_by || "quantity";
    const maxItems = limit || 10;

    const result = Array.from(grouped.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b[sortField] - a[sortField])
      .slice(0, maxItems);

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: query_alerts ──

server.tool(
  "query_alerts",
  "Get unresolved inventory alerts (low stock, out of stock, overstock).",
  {
    alert_type: z.enum(["low_stock", "out_of_stock", "overstock"]).optional().describe("Filter by alert type"),
  },
  async ({ alert_type }) => {
    let query = supabase
      .from("inventory_alerts")
      .select("*, inventory_items(name, category, current_stock, par_level, unit)")
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    if (alert_type) {
      query = query.eq("alert_type", alert_type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_tax_periods ──

server.tool(
  "query_tax_periods",
  "Get tax filing periods and their status. Returns period dates, taxable sales, tax collected, tax due, and filing status.",
  {
    status: z.enum(["pending", "computed", "filed"]).optional().describe("Filter by filing status"),
  },
  async ({ status }) => {
    let query = supabase
      .from("tax_periods")
      .select("*")
      .order("period_start", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: compute_st100 ──

server.tool(
  "compute_st100",
  "Compute the NYC ST-100 sales tax worksheet for a date range. Shows state, city, and MCTD tax breakdown.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    const { data, error } = await supabase
      .from("daily_sales")
      .select("gross_sales, net_sales, tax_collected")
      .gte("date", start_date)
      .lte("date", end_date);

    if (error) throw error;
    if (!data || data.length === 0) {
      return { content: [{ type: "text" as const, text: "No sales data found for the specified date range." }] };
    }

    const grossSales = data.reduce((sum, d) => sum + (d.gross_sales ?? 0), 0);
    const taxableSales = data.reduce((sum, d) => sum + (d.net_sales ?? 0), 0);
    const taxCollected = data.reduce((sum, d) => sum + (d.tax_collected ?? 0), 0);

    const stateTaxDue = round(taxableSales * 0.04);
    const cityTaxDue = round(taxableSales * 0.045);
    const mctdTaxDue = round(taxableSales * 0.00375);
    const totalTaxDue = round(stateTaxDue + cityTaxDue + mctdTaxDue);

    const worksheet = {
      periodStart: start_date,
      periodEnd: end_date,
      daysIncluded: data.length,
      grossSales: round(grossSales),
      taxableSales: round(taxableSales),
      taxCollected: round(taxCollected),
      stateTaxDue,
      cityTaxDue,
      mctdTaxDue,
      totalTaxDue,
      variance: round(taxCollected - totalTaxDue),
      varianceNote: taxCollected - totalTaxDue >= 0 ? "Overpaid (refund/credit)" : "Underpaid (additional due)",
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(worksheet, null, 2) }] };
  }
);

// ── Tool: query_employees ──

server.tool(
  "query_employees",
  "Get the employee list with roles and hourly rates.",
  {
    active_only: z.boolean().optional().describe("If true (default), only show active employees"),
  },
  async ({ active_only }) => {
    let query = supabase.from("employees").select("*").order("name");

    if (active_only !== false) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_time_entries ──

server.tool(
  "query_time_entries",
  "Get labor hours and tips for a date range. Useful for payroll computation.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
    employee_id: z.number().optional().describe("Filter by specific employee ID"),
  },
  async ({ start_date, end_date, employee_id }) => {
    let query = supabase
      .from("time_entries")
      .select("*, employees(name, role)")
      .gte("date", start_date)
      .lte("date", end_date)
      .order("date");

    if (employee_id !== undefined) {
      query = query.eq("employee_id", employee_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_recipes ──

server.tool(
  "query_recipes",
  "Look up cocktail recipes and prep batches with ingredients and costs.",
  {
    name: z.string().optional().describe("Search by recipe name"),
    type: z.string().optional().describe("Filter by type (e.g., 'cocktail', 'prep_batch')"),
  },
  async ({ name, type }) => {
    let query = supabase
      .from("recipes")
      .select("*, recipe_ingredients(*)")
      .order("name");

    if (name) {
      query = query.ilike("name", `%${name}%`);
    }
    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_gift_cards ──

server.tool(
  "query_gift_cards",
  "Get gift card information including balances and status.",
  {
    status: z.enum(["active", "depleted", "expired", "voided"]).optional().describe("Filter by gift card status"),
  },
  async ({ status }) => {
    let query = supabase
      .from("gift_cards")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: query_sync_logs ──

server.tool(
  "query_sync_logs",
  "Get recent integration sync logs. Shows status of Toast, Google Drive, xtraCHEF, and other syncs.",
  {
    source: z.string().optional().describe("Filter by source (e.g., 'toast', 'google_drive', 'xtrachef')"),
    limit: z.number().optional().describe("Number of logs to return (default 10)"),
  },
  async ({ source, limit }) => {
    let query = supabase
      .from("sync_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit || 10);

    if (source) {
      query = query.eq("source", source);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Tool: search_documents ──

server.tool(
  "search_documents",
  "Search Google Drive documents using semantic similarity. Finds relevant documents, P&Ls, contracts, and other files synced from Drive.",
  {
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().describe("Max number of results (default 5)"),
  },
  async ({ query, limit }) => {
    const maxResults = limit || 5;

    try {
      const embedding = await embedQuery(query);

      const { data, error } = await supabase.rpc("match_document_chunks", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: maxResults,
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        return { content: [{ type: "text" as const, text: "No matching documents found." }] };
      }

      // Fetch document metadata
      const docIds = [...new Set(data.map((d: { document_id: number }) => d.document_id))];
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title, metadata")
        .in("id", docIds);

      const docMap = new Map<number, { title: string; folder?: string }>();
      for (const d of docs || []) {
        const doc = d as { id: number; title: string; metadata: Record<string, string> | null };
        docMap.set(doc.id, { title: doc.title, folder: doc.metadata?.folder });
      }

      const results = data.map((chunk: { document_id: number; content: string; similarity: number }) => ({
        title: docMap.get(chunk.document_id)?.title || "Untitled",
        folder: docMap.get(chunk.document_id)?.folder || "",
        content: chunk.content,
        similarity: Math.round(chunk.similarity * 100) + "%",
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      console.error("Embedding search failed, falling back to text search:", err);
      // Fall back to text search if embedding fails
      const { data, error } = await supabase
        .from("documents")
        .select("title, content, metadata")
        .or(`title.ilike.%${query.replace(/[\\%_,().]/g, "\\$&")}%,content.ilike.%${query.replace(/[\\%_,().]/g, "\\$&")}%`)
        .limit(maxResults);

      if (error) throw error;

      const results = (data || []).map((doc) => ({
        title: doc.title,
        folder: (doc.metadata as Record<string, string>)?.folder || "",
        content: doc.content?.slice(0, 2000) || "",
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
    }
  }
);

// ── Start server ──

const transport = new StdioServerTransport();
await server.connect(transport);
