import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerateContentResult,
  type Tool,
} from "@google/generative-ai";
import { createServerClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: `You are an AI assistant for a 50-seat cocktail bar in Brooklyn, NY.
You help with inventory management, sales analysis, scheduling, and general bar operations.
You have access to tools to query the bar's database. Use them to answer questions with real data.
Be concise and actionable. Format currency as USD. Use tables when presenting multiple items.`,
});

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
    ],
  },
];

// Tool execution handlers
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
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
        // RPC or filter client-side since Supabase doesn't support col-vs-col filters easily
      }

      const { data, error } = await query;
      if (error) throw error;

      if (args.low_stock_only && data) {
        return data.filter(
          (item) => item.par_level && item.current_stock <= item.par_level
        );
      }
      return data;
    }

    case "query_sales": {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("*")
        .gte("date", args.start_date)
        .lte("date", args.end_date)
        .order("date");

      if (error) throw error;
      return data;
    }

    case "query_top_sellers": {
      const { data, error } = await supabase
        .from("order_items")
        .select("name, menu_item_guid")
        .gte("date", args.start_date)
        .lte("date", args.end_date);

      if (error) throw error;

      // Aggregate in memory (Supabase free tier doesn't support custom SQL via API)
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

      return Array.from(grouped.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b[sortBy as "quantity" | "revenue"] - a[sortBy as "quantity" | "revenue"])
        .slice(0, limit);
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

export async function chat(
  messages: ChatMessage[]
): Promise<string> {
  const chatSession = model.startChat({
    tools,
    history: messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
  });

  const lastMessage = messages[messages.length - 1];
  let result: GenerateContentResult = await chatSession.sendMessage(lastMessage.content);

  // Handle tool calls in a loop (Gemini may call multiple tools)
  while (result.response.candidates?.[0]?.content?.parts?.some((p) => p.functionCall)) {
    const functionCalls = result.response.candidates[0].content.parts.filter(
      (p) => p.functionCall
    );

    const toolResults = await Promise.all(
      functionCalls.map(async (part) => {
        const fc = part.functionCall!;
        try {
          const toolResult = await executeTool(fc.name, fc.args as Record<string, unknown>);
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
  }

  return result.response.text();
}

// Specialized: generate inventory reorder suggestions
export async function generateReorderSuggestions(): Promise<string> {
  const supabase = createServerClient();

  // Fetch low-stock items
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

  // Fetch recent sales velocity (last 7 days of order items)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentOrders } = await supabase
    .from("order_items")
    .select("*")
    .gte("date", weekAgo.toISOString().split("T")[0]);

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
