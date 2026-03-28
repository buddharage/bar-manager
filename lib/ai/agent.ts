import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerateContentResult,
  type Tool,
} from "@google/generative-ai";
import { createServerClient } from "@/lib/supabase/server";
import { findSimilarChunks } from "@/lib/ai/embeddings";
import { searchMessages, getMessageContent, processInBatches } from "@/lib/integrations/google-client";
import { computeST100 } from "@/lib/tax/st100";
import {
  getCachedToolResult,
  setCachedToolResult,
  createTokenUsage,
  type TokenUsage,
} from "@/lib/ai/token-cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const BASE_SYSTEM_INSTRUCTION = `You are an AI assistant for a 50-seat cocktail bar in Brooklyn, NY.
You help with inventory management, sales analysis, scheduling, and general bar operations.
You have access to tools to query the bar's database. Use them to answer questions with real data.
You can search Gmail live for receipts, invoices, and order confirmations using the search_gmail tool.
Relevant documents from Google Drive are automatically provided as context below when available.
You can also look up tax periods, compute ST-100 tax worksheets, search recipes, check employee/labor data, and track gift cards.
Be concise and actionable. Format currency as USD. Use tables when presenting multiple items.
When the user asks about sales tax owed, after presenting the numbers always ask if they'd like to go to the NYS Tax dashboard to make an advanced payment: https://ols.tax.ny.gov/accountSummary`;

// Tool definitions for Gemini function calling
const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "query_inventory",
        description:
          "Get current inventory items with stock levels. Can filter by category or low-stock status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            category: {
              type: SchemaType.STRING,
              description: "Filter by category (e.g., 'spirits', 'beer', 'wine', 'mixers')",
            },
            low_stock_only: {
              type: SchemaType.BOOLEAN,
              description: "If true, only return items where current_stock <= par_level",
            },
          },
        },
      },
      {
        name: "query_sales",
        description: "Get sales data for a date range.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: {
              type: SchemaType.STRING,
              description: "Start date in YYYY-MM-DD format",
            },
            end_date: {
              type: SchemaType.STRING,
              description: "End date in YYYY-MM-DD format",
            },
          },
          required: ["start_date", "end_date"],
        },
      },
      {
        name: "query_top_sellers",
        description: "Get the top-selling menu items by quantity or revenue for a date range.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: {
              type: SchemaType.STRING,
              description: "Start date in YYYY-MM-DD format",
            },
            end_date: {
              type: SchemaType.STRING,
              description: "End date in YYYY-MM-DD format",
            },
            sort_by: {
              type: SchemaType.STRING,
              description: "Sort by total quantity sold or total revenue (quantity or revenue)",
            },
            limit: {
              type: SchemaType.INTEGER,
              description: "Number of items to return (default 10)",
            },
          },
          required: ["start_date", "end_date"],
        },
      },
      {
        name: "query_alerts",
        description: "Get unresolved inventory alerts.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            alert_type: {
              type: SchemaType.STRING,
              description: "Filter by alert type (low_stock, out_of_stock, or overstock)",
            },
          },
        },
      },
      {
        name: "search_documents",
        description:
          "Search Google Drive documents using semantic similarity. Use this for deeper or more specific searches beyond the auto-provided context.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Natural language search query (e.g., 'Sysco invoice from January', 'liquor license renewal', 'P&L 2024')",
            },
            limit: {
              type: SchemaType.INTEGER,
              description: "Max number of results to return (default 5)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_gmail",
        description:
          "Search Gmail live for emails. Always returns the latest results. Supports Gmail search operators.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description:
                "Gmail search query. Supports operators like from:, subject:, after:, before:, has:attachment (e.g., 'from:sysco subject:invoice after:2025/01/01')",
            },
            max_results: {
              type: SchemaType.INTEGER,
              description: "Maximum number of emails to return (default 5)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "query_tax_periods",
        description:
          "Get tax filing periods and their status. Returns period dates, taxable sales, tax collected, tax due, and filing status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: {
              type: SchemaType.STRING,
              description: "Filter by status: pending, computed, or filed",
            },
          },
        },
      },
      {
        name: "compute_st100",
        description:
          "Compute the NYC ST-100 sales tax worksheet for a date range. Shows state, city, and MCTD tax breakdown.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: {
              type: SchemaType.STRING,
              description: "Start date in YYYY-MM-DD format",
            },
            end_date: {
              type: SchemaType.STRING,
              description: "End date in YYYY-MM-DD format",
            },
          },
          required: ["start_date", "end_date"],
        },
      },
      {
        name: "query_recipes",
        description:
          "Look up cocktail recipes and prep batches with ingredients and costs.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "Search by recipe name",
            },
            type: {
              type: SchemaType.STRING,
              description: "Filter by type (e.g., 'cocktail', 'prep_batch')",
            },
          },
        },
      },
      {
        name: "query_employees",
        description: "Get the employee list with roles and hourly rates.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            active_only: {
              type: SchemaType.BOOLEAN,
              description: "If true (default), only show active employees",
            },
          },
        },
      },
      {
        name: "query_time_entries",
        description:
          "Get labor hours and tips for a date range. Useful for payroll computation.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            start_date: {
              type: SchemaType.STRING,
              description: "Start date in YYYY-MM-DD format",
            },
            end_date: {
              type: SchemaType.STRING,
              description: "End date in YYYY-MM-DD format",
            },
            employee_id: {
              type: SchemaType.INTEGER,
              description: "Filter by specific employee ID",
            },
          },
          required: ["start_date", "end_date"],
        },
      },
      {
        name: "query_gift_cards",
        description: "Get gift card information including balances and status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: {
              type: SchemaType.STRING,
              description: "Filter by status: active, depleted, expired, or voided",
            },
          },
        },
      },
      {
        name: "format_recipes_for_xtrachef",
        description:
          "Format recipes from the database into structured output ready for xtraCHEF entry. Returns ingredients with house brand preferences applied.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            recipe_group: {
              type: SchemaType.STRING,
              description: "Filter by recipe group (e.g., 'House Cocktails', 'Cocktail Batch', 'Syrups')",
            },
            name: {
              type: SchemaType.STRING,
              description: "Search by recipe name",
            },
          },
        },
      },
      {
        name: "query_sync_logs",
        description:
          "Get recent integration sync logs. Shows status of Toast, Google Drive, xtraCHEF, and other syncs.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            source: {
              type: SchemaType.STRING,
              description: "Filter by source (e.g., 'toast', 'google_drive', 'xtrachef')",
            },
            limit: {
              type: SchemaType.INTEGER,
              description: "Number of logs to return (default 10)",
            },
          },
        },
      },
    ],
  },
];

// Tool execution handlers
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  usage?: TokenUsage
): Promise<unknown> {
  // Check tool result cache (skips live-data tools like search_gmail)
  const cached = getCachedToolResult(name, args);
  if (cached !== undefined) {
    if (usage) usage.toolCallsCached++;
    return cached;
  }
  if (usage) usage.toolCallsExecuted++;

  const supabase = createServerClient();

  switch (name) {
    case "query_inventory": {
      let query = supabase
        .from("inventory_items")
        .select("*")
        .order("name");

      if (args.category) {
        query = query.ilike("category", `%${args.category}%`);
      }
      if (args.low_stock_only) {
        query = query.not("par_level", "is", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      const result = args.low_stock_only && data
        ? data.filter((item) => item.par_level && item.current_stock <= item.par_level)
        : data;
      setCachedToolResult(name, args, result);
      return result;
    }

    case "query_sales": {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("*")
        .gte("date", args.start_date)
        .lte("date", args.end_date)
        .order("date");

      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "query_top_sellers": {
      const { data, error } = await supabase
        .from("order_items")
        .select("name, menu_item_guid")
        .gte("date", args.start_date)
        .lte("date", args.end_date);

      if (error) throw error;

      const grouped = new Map<string, { quantity: number; revenue: number }>();
      for (const item of data || []) {
        const key = item.name;
        const existing = grouped.get(key) || { quantity: 0, revenue: 0 };
        existing.quantity += (item as unknown as { quantity: number }).quantity || 1;
        existing.revenue += (item as unknown as { revenue: number }).revenue || 0;
        grouped.set(key, existing);
      }

      const sortBy = (args.sort_by as string) || "quantity";
      const limit = (args.limit as number) || 10;

      const result = Array.from(grouped.entries())
        .map(([itemName, stats]) => ({ name: itemName, ...stats }))
        .sort((a, b) => b[sortBy as "quantity" | "revenue"] - a[sortBy as "quantity" | "revenue"])
        .slice(0, limit);
      setCachedToolResult(name, args, result);
      return result;
    }

    case "query_alerts": {
      let query = supabase
        .from("inventory_alerts")
        .select("*, inventory_items(name, category, current_stock, par_level, unit)")
        .eq("resolved", false)
        .order("created_at", { ascending: false });

      if (args.alert_type) {
        query = query.eq("alert_type", args.alert_type);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "search_documents": {
      const limit = (args.limit as number) || 5;
      const query = args.query as string;

      const embStats = usage ? { cached: 0, computed: 0 } : undefined;
      const chunks = await findSimilarChunks(query, limit, undefined, embStats);
      if (usage && embStats) {
        usage.embeddingsCached += embStats.cached;
        usage.embeddingsComputed += embStats.computed;
      }

      const result = chunks.map((chunk) => ({
        title: chunk.title || "Untitled",
        folder: chunk.folder || "",
        content: chunk.content,
        similarity: Math.round(chunk.similarity * 100) + "%",
      }));
      setCachedToolResult(name, args, result);
      return result;
    }

    case "search_gmail": {
      const maxResults = (args.max_results as number) || 5;
      const query = args.query as string;

      const searchResult = await searchMessages(query);
      const messageRefs = (searchResult.messages || []).slice(0, maxResults);

      if (messageRefs.length === 0) return [];

      const results: Array<{
        subject: string;
        from: string;
        date: string;
        body: string;
      }> = [];

      await processInBatches(
        messageRefs,
        async (msg) => {
          const content = await getMessageContent(msg.id);
          results.push({
            subject: content.subject,
            from: content.from,
            date: content.date,
            body: content.body.slice(0, 4000),
          });
        },
        3
      );

      // search_gmail is not cached (always live) — setCachedToolResult is a no-op for it
      return results;
    }

    case "query_tax_periods": {
      let query = supabase
        .from("tax_periods")
        .select("*")
        .order("period_start", { ascending: false });

      if (args.status) {
        query = query.eq("status", args.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "compute_st100": {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("gross_sales, net_sales, tax_collected")
        .gte("date", args.start_date)
        .lte("date", args.end_date);

      if (error) throw error;
      if (!data || data.length === 0) return { error: "No sales data for the specified range" };

      const worksheet = computeST100(data);
      worksheet.periodStart = args.start_date as string;
      worksheet.periodEnd = args.end_date as string;
      setCachedToolResult(name, args, worksheet);
      return worksheet;
    }

    case "query_recipes": {
      let query = supabase
        .from("recipes")
        .select("*, recipe_ingredients(*)")
        .order("name");

      if (args.name) {
        query = query.ilike("name", `%${args.name}%`);
      }
      if (args.type) {
        query = query.eq("type", args.type);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "query_employees": {
      let query = supabase.from("employees").select("*").order("name");

      if (args.active_only !== false) {
        query = query.eq("active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "query_time_entries": {
      let query = supabase
        .from("time_entries")
        .select("*, employees(name, role)")
        .gte("date", args.start_date)
        .lte("date", args.end_date)
        .order("date");

      if (args.employee_id !== undefined) {
        query = query.eq("employee_id", args.employee_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "query_gift_cards": {
      let query = supabase
        .from("gift_cards")
        .select("*")
        .order("created_at", { ascending: false });

      if (args.status) {
        query = query.eq("status", args.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    case "format_recipes_for_xtrachef": {
      let query = supabase
        .from("recipes")
        .select("name, type, recipe_group, serving_size, batch_size, batch_uom, recipe_ingredients(name, type, quantity, uom)")
        .order("name");

      if (args.recipe_group) {
        query = query.ilike("recipe_group", `%${args.recipe_group}%`);
      }
      if (args.name) {
        query = query.ilike("name", `%${args.name}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return { message: "No recipes found matching the criteria." };

      const brandMap: Record<string, string> = {
        gin: "Gary's Good",
        vodka: "Gary's Good",
        bourbon: "Old Crow",
        rum: "Plantation Dark",
        tequila: "Anza",
      };

      const formatted = data.map((recipe) => {
        const ingredients = (recipe.recipe_ingredients || []).map(
          (ing: { name: string; type: string; quantity: number | null; uom: string | null }) => {
            let ingredientName = ing.name;
            const nameLower = ingredientName.toLowerCase();
            for (const [spirit, brand] of Object.entries(brandMap)) {
              if (nameLower.includes(spirit) && !nameLower.includes(brand.toLowerCase())) {
                ingredientName += ` (prefer ${brand})`;
                break;
              }
            }
            return { name: ingredientName, type: ing.type, quantity: ing.quantity, uom: ing.uom };
          }
        );

        return {
          name: recipe.name,
          recipe_group: recipe.recipe_group,
          type: recipe.type,
          serving_size: recipe.serving_size,
          batch_size: recipe.batch_size,
          batch_uom: recipe.batch_uom,
          ingredients,
          ingredient_count: ingredients.length,
          has_ingredients: ingredients.length > 0,
        };
      });

      const result = {
        total_recipes: formatted.length,
        missing_ingredients: formatted.filter((r) => !r.has_ingredients).map((r) => r.name),
        recipes: formatted,
      };
      setCachedToolResult(name, args, result);
      return result;
    }

    case "query_sync_logs": {
      let query = supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit((args.limit as number) || 10);

      if (args.source) {
        query = query.eq("source", args.source);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCachedToolResult(name, args, data);
      return data;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatResult {
  response: string;
  usage: TokenUsage;
}

export async function chat(
  messages: ChatMessage[]
): Promise<ChatResult> {
  const usage = createTokenUsage();
  const embeddingStats = { cached: 0, computed: 0 };
  const lastMessage = messages[messages.length - 1];

  // ── Inject current date so the model can resolve relative dates ──
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
  let systemInstruction = BASE_SYSTEM_INSTRUCTION +
    `\nToday is ${currentDate}. Use this date to interpret relative time expressions like "last week", "this month", "yesterday", etc.`;

  // ── Auto-RAG: retrieve relevant Drive document chunks ──

  try {
    const chunks = await findSimilarChunks(lastMessage.content, 5, 0.35, embeddingStats);
    usage.ragCacheHit = embeddingStats.cached > 0;

    if (chunks.length > 0) {
      systemInstruction += "\n\n─── RELEVANT DOCUMENTS FROM GOOGLE DRIVE ───";
      for (const chunk of chunks) {
        const source = [chunk.title, chunk.folder].filter(Boolean).join(" — ");
        systemInstruction += `\n\n[${source}]\n${chunk.content}`;
      }
      systemInstruction += "\n\n─── END DOCUMENTS ───";
    }
  } catch (err) {
    // RAG failure shouldn't break chat — proceed without context
    console.error("RAG retrieval failed:", err);
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });

  const chatSession = model.startChat({
    tools,
    history: messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });

  let result: GenerateContentResult = await chatSession.sendMessage(lastMessage.content);

  // Accumulate token usage from Gemini response metadata
  function trackTokens(r: GenerateContentResult) {
    const meta = r.response.usageMetadata;
    if (meta) {
      usage.promptTokens += meta.promptTokenCount ?? 0;
      usage.completionTokens += meta.candidatesTokenCount ?? 0;
      usage.totalTokens += meta.totalTokenCount ?? 0;
      usage.cachedContentTokens += meta.cachedContentTokenCount ?? 0;
    }
  }

  trackTokens(result);

  // Handle tool calls in a loop (Gemini may call multiple tools)
  while (result.response.candidates?.[0]?.content?.parts?.some((p) => p.functionCall)) {
    const functionCalls = result.response.candidates[0].content.parts.filter(
      (p) => p.functionCall
    );

    const toolResults = await Promise.all(
      functionCalls.map(async (part) => {
        const fc = part.functionCall!;
        try {
          const toolResult = await executeTool(
            fc.name,
            fc.args as Record<string, unknown>,
            usage
          );
          return {
            functionResponse: {
              name: fc.name,
              response: { result: toolResult },
            },
          };
        } catch (error) {
          return {
            functionResponse: {
              name: fc.name,
              response: { error: String(error) },
            },
          };
        }
      })
    );

    result = await chatSession.sendMessage(toolResults);
    trackTokens(result);
  }

  usage.embeddingsCached = embeddingStats.cached;
  usage.embeddingsComputed = embeddingStats.computed;

  return { response: result.response.text(), usage };
}

// Specialized: generate inventory reorder suggestions
export async function generateReorderSuggestions(): Promise<string> {
  const supabase = createServerClient();

  const { data: items } = await supabase
    .from("inventory_items")
    .select("*")
    .not("par_level", "is", null);

  const lowStock = (items || []).filter(
    (item) => item.par_level && item.current_stock <= item.par_level
  );

  if (lowStock.length === 0) {
    return "All inventory items are above par levels. No reorders needed.";
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentOrders } = await supabase
    .from("order_items")
    .select("*")
    .gte("date", weekAgo.toISOString().split("T")[0]);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: BASE_SYSTEM_INSTRUCTION,
  });

  const prompt = `Analyze this bar inventory data and generate a reorder list.

LOW STOCK ITEMS:
${JSON.stringify(lowStock, null, 2)}

RECENT SALES (last 7 days):
${JSON.stringify(recentOrders || [], null, 2)}

For each low-stock item, suggest:
1. Recommended order quantity (enough for ~2 weeks based on sales velocity)
2. Priority (urgent/normal)
3. Estimated cost if cost_per_unit is available

Format as a clear, actionable list.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
