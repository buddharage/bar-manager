import { describe, it, expect, vi, beforeEach } from "vitest";

// Dynamic import for path alias resolution
const { recalculateExpectedInventory } = await import("./expected");

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockData {
  ingredients: Record<string, unknown>[];
  recipes: Record<string, unknown>[];
  recipe_ingredients: Record<string, unknown>[];
  order_items: Record<string, unknown>[];
  inventory_alerts: Record<string, unknown>[];
}

function createMockSupabase(data: MockData) {
  const updates: { table: string; id: number; fields: Record<string, unknown> }[] = [];
  const inserts: { table: string; data: Record<string, unknown> }[] = [];
  const alertUpdates: { ingredient_id: number; resolved: boolean }[] = [];

  function makeChain(result: { data: unknown; error: null }) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue(result);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);

    // Make each method return the chain for further chaining
    for (const key of Object.keys(chain)) {
      if (!["single", "maybeSingle"].includes(key)) {
        const origFn = chain[key] as ReturnType<typeof vi.fn>;
        chain[key] = vi.fn((...args: unknown[]) => {
          origFn(...args);
          return chain;
        });
      }
    }

    // Override: `then` so the chain can be awaited directly (for queries without .single())
    (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve(result);
    };

    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "ingredients") {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              ...makeChain({ data: data.ingredients, error: null }),
            }),
            eq: vi.fn().mockReturnValue(
              makeChain({ data: data.ingredients[0] || null, error: null }),
            ),
          }),
          update: vi.fn((fields: Record<string, unknown>) => {
            return {
              eq: vi.fn((col: string, val: unknown) => {
                updates.push({ table: "ingredients", id: val as number, fields });
                return Promise.resolve({ error: null });
              }),
            };
          }),
        };
      }

      if (table === "recipes") {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue(
              makeChain({ data: data.recipes.filter((r) => r.toast_item_guid), error: null }),
            ),
            eq: vi.fn().mockReturnValue(
              makeChain({
                data: data.recipes.filter((r) => r.type === "prep_recipe"),
                error: null,
              }),
            ),
          }),
        };
      }

      if (table === "recipe_ingredients") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue(
              makeChain({ data: data.recipe_ingredients, error: null }),
            ),
          }),
        };
      }

      if (table === "order_items") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                range: vi.fn().mockReturnValue(
                  makeChain({ data: data.order_items, error: null }),
                ),
              }),
            }),
          }),
        };
      }

      if (table === "inventory_alerts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn((row: Record<string, unknown>) => {
            inserts.push({ table: "inventory_alerts", data: row });
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((fields: Record<string, unknown>) => {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn((col: string, val: unknown) => {
                  if (fields.resolved) {
                    alertUpdates.push({
                      ingredient_id: val as number,
                      resolved: true,
                    });
                  }
                  return Promise.resolve({ error: null });
                }),
              }),
            };
          }),
        };
      }

      return makeChain({ data: null, error: null });
    }),
    _tracking: { updates, inserts, alertUpdates },
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recalculateExpectedInventory", () => {
  it("returns zero counts when no ingredients have been counted", async () => {
    const supabase = createMockSupabase({
      ingredients: [],
      recipes: [],
      recipe_ingredients: [],
      order_items: [],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    expect(result.updated).toBe(0);
    expect(result.alerts).toBe(0);
  });

  it("sets expected_quantity to last_counted_quantity when no recipes are linked", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Vodka",
          unit: "oz",
          current_quantity: 100,
          par_level: 20,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 100,
        },
      ],
      recipes: [], // No recipes linked to Toast
      recipe_ingredients: [],
      order_items: [],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    expect(result.updated).toBe(1);
    // Should have updated the ingredient's expected_quantity
    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    expect(update).toBeDefined();
    expect(update!.fields.expected_quantity).toBe(100);
  });

  it("subtracts ingredient usage from sales", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Tequila Blanco",
          unit: "oz",
          current_quantity: 64,
          par_level: 10,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 64,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-margarita", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Tequila Blanco",
          type: "Ingredient",
          quantity: 2,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-margarita", quantity: 5 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    expect(result.updated).toBe(1);
    // 64 oz - (5 sold * 2 oz per serving) = 54 oz
    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    expect(update).toBeDefined();
    expect(update!.fields.expected_quantity).toBe(54);
  });

  it("creates alert when expected inventory falls below par level", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Lime Juice",
          unit: "oz",
          current_quantity: 12,
          par_level: 8,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 12,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-margarita", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Lime Juice",
          type: "Ingredient",
          quantity: 1,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-margarita", quantity: 5 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    // 12 - 5 = 7, which is < par_level 8
    expect(result.alerts).toBe(1);
    expect(supabase._tracking.inserts).toHaveLength(1);
    expect(supabase._tracking.inserts[0].table).toBe("inventory_alerts");
    expect(supabase._tracking.inserts[0].data.alert_type).toBe("low_stock");
  });

  it("does not create alert when expected inventory is above par level", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Vodka",
          unit: "oz",
          current_quantity: 100,
          par_level: 20,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 100,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-martini", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Vodka",
          type: "Ingredient",
          quantity: 2,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-martini", quantity: 10 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    // 100 - 20 = 80, which is > par_level 20
    expect(result.alerts).toBe(0);
    expect(supabase._tracking.inserts).toHaveLength(0);
  });

  it("expected quantity does not go below zero", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Tequila Blanco",
          unit: "oz",
          current_quantity: 4,
          par_level: 10,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 4,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-margarita", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Tequila Blanco",
          type: "Ingredient",
          quantity: 2,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-margarita", quantity: 10 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    // 4 - 20 = -16, clamped to 0
    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    expect(update!.fields.expected_quantity).toBe(0);
  });

  it("handles unit conversion between recipe uom and ingredient base unit", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Vodka",
          unit: "ml",
          current_quantity: 1000,
          par_level: 200,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 1000,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-martini", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Vodka",
          type: "Ingredient",
          quantity: 2,
          uom: "oz", // recipe uses oz, ingredient tracks ml
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-martini", quantity: 5 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    // 5 servings * 2 oz = 10 oz ≈ 295.735 ml
    // 1000 - 295.735 ≈ 704.265
    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    expect(update).toBeDefined();
    expect(update!.fields.expected_quantity).toBeCloseTo(704.265, 0);
  });

  it("ignores order items with no matching recipe", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "Tequila Blanco",
          unit: "oz",
          current_quantity: 64,
          par_level: 10,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 64,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-margarita", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Tequila Blanco",
          type: "Ingredient",
          quantity: 2,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        // This order item has no matching recipe
        { menu_item_guid: "toast-unknown-item", quantity: 20 },
        // This one does
        { menu_item_guid: "toast-margarita", quantity: 3 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    // Only 3 margaritas count: 64 - (3 * 2) = 58
    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    expect(update!.fields.expected_quantity).toBe(58);
  });

  it("ingredient name matching is case-insensitive", async () => {
    const supabase = createMockSupabase({
      ingredients: [
        {
          id: 1,
          name: "tequila blanco",
          unit: "oz",
          current_quantity: 64,
          par_level: 10,
          last_counted_at: "2026-02-01T00:00:00Z",
          last_counted_quantity: 64,
        },
      ],
      recipes: [
        { id: 10, toast_item_guid: "toast-margarita", batch_size: null, batch_uom: null },
      ],
      recipe_ingredients: [
        {
          recipe_id: 10,
          name: "Tequila Blanco",
          type: "Ingredient",
          quantity: 2,
          uom: "oz",
          reference_guid: null,
        },
      ],
      order_items: [
        { menu_item_guid: "toast-margarita", quantity: 5 },
      ],
      inventory_alerts: [],
    });

    const result = await recalculateExpectedInventory(supabase as any);

    const update = supabase._tracking.updates.find(
      (u) => u.table === "ingredients" && u.id === 1,
    );
    // Should match despite case difference: 64 - 10 = 54
    expect(update!.fields.expected_quantity).toBe(54);
  });
});
