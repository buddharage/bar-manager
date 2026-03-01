import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock the @/lib/integrations/xtrachef-client module import
// Since syncXtrachefRecipes takes a SupabaseClient and XtrachefClient as args,
// we can directly construct mock objects.

// Dynamic import so path alias resolution doesn't block tests
// We'll test the sync logic by mocking supabase and the xtrachef client.

import type { FullRecipe } from "@/lib/integrations/xtrachef-client";

// Build mock supabase that tracks calls
function createMockSupabase() {
  const calls: Record<string, unknown[]> = {};

  function track(method: string, ...args: unknown[]) {
    if (!calls[method]) calls[method] = [];
    calls[method].push(args);
  }

  // Chain builder for supabase query methods
  function chainBuilder(overrides: Record<string, unknown> = {}) {
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
      ...overrides,
    };
    // Make each method return the chain
    for (const key of Object.keys(chain)) {
      if (typeof chain[key] === "function" && key !== "single") {
        const origFn = chain[key] as ReturnType<typeof vi.fn>;
        (chain as Record<string, unknown>)[key] = vi.fn((...args: unknown[]) => {
          origFn(...args);
          return chain;
        });
      }
    }
    return chain;
  }

  const upsertChain = chainBuilder();
  const insertChain = chainBuilder();
  const deleteChain = chainBuilder();
  const selectChain = chainBuilder({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  // Track raw ingredient queries separately
  const rawIngredientSelectChain = chainBuilder({
    neq: vi.fn().mockReturnValue(
      Promise.resolve({
        data: [
          { name: "Tequila Blanco", uom: "oz", cost: 1.8, quantity: 2 },
          { name: "Lime Juice", uom: "oz", cost: 0.5, quantity: 1 },
        ],
        error: null,
      }),
    ),
  });

  const upsertedRecipes: unknown[] = [];
  const insertedIngredients: unknown[] = [];
  const deletedFrom: string[] = [];
  const upsertedRawIngredients: unknown[] = [];
  let fromCallCount = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      fromCallCount++;
      track("from", table);

      if (table === "recipes") {
        return {
          upsert: vi.fn((data: unknown) => {
            upsertedRecipes.push(data);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: upsertedRecipes.length },
                  error: null,
                }),
              }),
            };
          }),
        };
      }

      if (table === "recipe_ingredients") {
        // Could be delete or insert
        return {
          delete: vi.fn(() => {
            deletedFrom.push(table);
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
          insert: vi.fn((data: unknown) => {
            insertedIngredients.push(data);
            return Promise.resolve({ error: null });
          }),
          select: vi.fn((..._args: unknown[]) => {
            return {
              neq: vi.fn().mockResolvedValue({
                data: [
                  { name: "Tequila Blanco", uom: "oz", cost: 1.8, quantity: 2 },
                  { name: "Lime Juice", uom: "oz", cost: 0.5, quantity: 1 },
                  { name: "Sugar", uom: "oz", cost: 0.6, quantity: 16 },
                ],
                error: null,
              }),
            };
          }),
        };
      }

      if (table === "ingredients") {
        return {
          upsert: vi.fn((data: unknown) => {
            upsertedRawIngredients.push(data);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {};
    }),
    _tracking: {
      calls,
      upsertedRecipes,
      insertedIngredients,
      deletedFrom,
      upsertedRawIngredients,
    },
  };

  return supabase;
}

function createMockClient(recipes: FullRecipe[]) {
  return {
    fetchAllRecipes: vi.fn().mockResolvedValue(recipes),
  };
}

const SAMPLE_RECIPES: FullRecipe[] = [
  {
    recipe: {
      xtrachef_id: 101,
      xtrachef_guid: "guid-101",
      name: "Margarita",
      type: "recipe",
      recipe_group: "Cocktails",
      status: "Active",
      menu_price: 14,
      prime_cost: 3.5,
      food_cost_pct: 25,
      toast_item_guid: "toast-1",
      serving_size: 1,
      batch_size: null,
      batch_uom: null,
      last_modified_at: "2025-06-01T12:00:00.000Z",
      last_modified_by: "chef@bar.com",
    },
    ingredients: [
      {
        xtrachef_id: 1001,
        name: "Tequila Blanco",
        type: "Ingredient",
        quantity: 2,
        uom: "oz",
        cost: 1.8,
        reference_id: "ref-1",
        reference_guid: "ref-guid-1",
        ingredient_yield: 1,
      },
      {
        xtrachef_id: 1002,
        name: "Lime Juice",
        type: "Ingredient",
        quantity: 1,
        uom: "oz",
        cost: 0.5,
        reference_id: "ref-2",
        reference_guid: "ref-guid-2",
        ingredient_yield: 1,
      },
    ],
  },
  {
    recipe: {
      xtrachef_id: 202,
      xtrachef_guid: "guid-202",
      name: "Simple Syrup",
      type: "prep_recipe",
      recipe_group: "Prep",
      status: "Active",
      menu_price: null,
      prime_cost: 1.2,
      food_cost_pct: null,
      toast_item_guid: null,
      serving_size: null,
      batch_size: 32,
      batch_uom: "oz",
      last_modified_at: "2025-05-15T10:00:00.000Z",
      last_modified_by: "chef@bar.com",
    },
    ingredients: [
      {
        xtrachef_id: 2001,
        name: "Sugar",
        type: "Ingredient",
        quantity: 16,
        uom: "oz",
        cost: 0.6,
        reference_id: "ref-3",
        reference_guid: "ref-guid-3",
        ingredient_yield: 1,
      },
    ],
  },
];

// Since the module uses @/ path alias which may not resolve in vitest without config,
// we import using relative path
const { syncXtrachefRecipes } = await import("./xtrachef-recipes");

describe("syncXtrachefRecipes", () => {
  it("returns correct counts for a successful sync", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);

    const result = await syncXtrachefRecipes(supabase as any, client as any);

    expect(result.recipesUpserted).toBe(2);
    expect(result.ingredientLinesInserted).toBe(3); // 2 + 1
    expect(result.errors).toHaveLength(0);
  });

  it("calls fetchAllRecipes with onProgress", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);
    const onProgress = vi.fn();

    await syncXtrachefRecipes(supabase as any, client as any, { onProgress });

    expect(client.fetchAllRecipes).toHaveBeenCalledWith({
      onProgress,
    });
  });

  it("upserts each recipe to the recipes table", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);

    await syncXtrachefRecipes(supabase as any, client as any);

    // Should have called from("recipes") for each recipe
    const recipeCalls = supabase._tracking.upsertedRecipes;
    expect(recipeCalls).toHaveLength(2);

    // First recipe should be Margarita
    const first = recipeCalls[0] as Record<string, unknown>;
    expect(first.name).toBe("Margarita");
    expect(first.xtrachef_id).toBe(101);
    expect(first.last_synced_at).toBeDefined();
  });

  it("deletes old ingredients before inserting new ones", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);

    await syncXtrachefRecipes(supabase as any, client as any);

    // Should have deleted from recipe_ingredients for each recipe
    expect(supabase._tracking.deletedFrom.filter((t: string) => t === "recipe_ingredients")).toHaveLength(2);
  });

  it("inserts ingredient lines for each recipe", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);

    await syncXtrachefRecipes(supabase as any, client as any);

    const inserted = supabase._tracking.insertedIngredients;
    expect(inserted).toHaveLength(2); // One insert call per recipe

    // First recipe has 2 ingredients
    const firstBatch = inserted[0] as Array<Record<string, unknown>>;
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0].name).toBe("Tequila Blanco");
    expect(firstBatch[0].recipe_id).toBeDefined();

    // Second recipe has 1 ingredient
    const secondBatch = inserted[1] as Array<Record<string, unknown>>;
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].name).toBe("Sugar");
  });

  it("populates raw ingredients table", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient(SAMPLE_RECIPES);

    const result = await syncXtrachefRecipes(supabase as any, client as any);

    expect(result.rawIngredientsUpserted).toBeGreaterThan(0);
  });

  it("handles empty recipe list", async () => {
    const supabase = createMockSupabase();
    const client = createMockClient([]);

    const result = await syncXtrachefRecipes(supabase as any, client as any);

    expect(result.recipesUpserted).toBe(0);
    expect(result.ingredientLinesInserted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("records error when recipe upsert fails", async () => {
    const failSupabase = {
      from: vi.fn((table: string) => {
        if (table === "recipes") {
          return {
            upsert: vi.fn(() => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "duplicate key" },
                }),
              }),
            })),
          };
        }
        if (table === "recipe_ingredients") {
          return {
            select: vi.fn(() => ({
              neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        if (table === "ingredients") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };

    const client = createMockClient(SAMPLE_RECIPES);
    const result = await syncXtrachefRecipes(failSupabase as any, client as any);

    expect(result.recipesUpserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Failed to upsert recipe");
  });

  it("handles recipe with no ingredients", async () => {
    const noIngredientRecipes: FullRecipe[] = [
      {
        recipe: {
          ...SAMPLE_RECIPES[0].recipe,
          name: "Empty Recipe",
        },
        ingredients: [],
      },
    ];

    const supabase = createMockSupabase();
    const client = createMockClient(noIngredientRecipes);

    const result = await syncXtrachefRecipes(supabase as any, client as any);

    expect(result.recipesUpserted).toBe(1);
    expect(result.ingredientLinesInserted).toBe(0);
    // No insert call for empty ingredients
    expect(supabase._tracking.insertedIngredients).toHaveLength(0);
  });
});
