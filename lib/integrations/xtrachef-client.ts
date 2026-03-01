/**
 * xtraCHEF Recipe API Client
 *
 * Calls xtraCHEF's internal API endpoints directly to fetch recipe data.
 * These endpoints are used by the xtraCHEF SPA at app.sa.toasttab.com
 * (visible in browser DevTools → Network tab when navigating to Recipes).
 *
 * Auth: Requires a Bearer token from a logged-in xtraCHEF browser session.
 * The user copies the Authorization header value from any request to
 * ecs-api-prod.sa.toasttab.com in browser DevTools and pastes it
 * into the bar-manager Settings page (or XTRACHEF_TOKEN env var).
 *
 * Endpoints (base: ecs-api-prod.sa.toasttab.com):
 *   Recipe list:
 *     GET /api.recipes-query/api/1.0/recipes-v2/tenants/{tenantId}/location/{locationId}/recipe-summary?isReGenerate=true
 *     → Returns all recipes with name, type, group, cost, Toast linkage
 *
 *   Recipe detail (per recipe):
 *     GET /api.recipes-query/api/1.0/recipes-v2/{recipeId}/tenants/{tenantId}/locations/{locationId}/recipe-details?isReGenerate=false
 *     → Returns full ingredient list with name, type, qty, UOM, cost
 *
 * Environment variables:
 *   XTRACHEF_TENANT_ID   — numeric tenant ID from the API URL (e.g. 39494)
 *   XTRACHEF_LOCATION_ID — numeric location ID from the API URL (e.g. 12802)
 */

const API_BASE = "https://ecs-api-prod.sa.toasttab.com/api.recipes-query/api/1.0/recipes-v2";

// ---------------------------------------------------------------------------
// Types — xtraCHEF API response shapes
// ---------------------------------------------------------------------------

export interface XCRecipeSummary {
  recipeId: number;
  guid: string;
  recipe: string; // name
  status: string;
  recipeGroups: string;
  type: string; // "Recipe" | "Prep Recipe"
  menuPrice: string | null;
  primeCost: string | null;
  foodCostPercent: string | null;
  lastModified: string;
  lastModifiedBy: string;
  posId: string | null;
  externalMenuItemGuid: string | null;
}

interface XCRecipeSummaryResponse {
  data: {
    totalRowCount: number;
    recipes: XCRecipeSummary[];
  };
  exception: unknown;
}

export interface XCIngredientLine {
  id: number;
  referenceId: string;
  referenceGuid: string;
  type: string; // "Prep recipe" | "Ingredient" etc.
  name: string;
  quantity: number;
  uomId: number;
  uom: string;
  ingredientYield: number;
  consumablePortion: number;
  cost: number;
}

export interface XCRecipeDetail {
  id: number;
  guid: string;
  name: string;
  status: string;
  lastModified: string;
  lastModifiedBy: string;
  basicDetail: {
    type: string;
    recipeGroup: string;
    externalMenuItemGuid: string | null;
    menuPrice: number;
    servingSize: number | null;
    batchSize: number | null;
    batchUomId: number | null;
    batchUomName: string | null;
  };
  stats: {
    menuPrice: number;
    foodCost: number;
    foodCostPercent: number;
  };
  ingredients: XCIngredientLine[];
}

interface XCRecipeDetailResponse {
  data: XCRecipeDetail;
  exception: unknown;
}

// ---------------------------------------------------------------------------
// Exported types for the sync layer
// ---------------------------------------------------------------------------

export interface RecipeRow {
  xtrachef_id: number;
  xtrachef_guid: string;
  name: string;
  type: "recipe" | "prep_recipe";
  recipe_group: string | null;
  status: string | null;
  menu_price: number | null;
  prime_cost: number | null;
  food_cost_pct: number | null;
  toast_item_guid: string | null;
  serving_size: number | null;
  batch_size: number | null;
  batch_uom: string | null;
  last_modified_at: string | null;
  last_modified_by: string | null;
}

export interface RecipeIngredientRow {
  xtrachef_id: number;
  name: string;
  type: string;
  quantity: number | null;
  uom: string | null;
  cost: number | null;
  reference_id: string | null;
  reference_guid: string | null;
  ingredient_yield: number | null;
}

export interface FullRecipe {
  recipe: RecipeRow;
  ingredients: RecipeIngredientRow[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class XtrachefClient {
  private tenantId: string;
  private locationId: string;
  private token: string;

  constructor(opts: { tenantId: string; locationId: string; token: string }) {
    this.tenantId = opts.tenantId;
    this.locationId = opts.locationId;
    this.token = opts.token;
  }

  private async apiFetch<T>(url: string): Promise<T> {
    // The token may already include "Bearer " prefix — normalize it
    const bearer = this.token.startsWith("Bearer ")
      ? this.token
      : `Bearer ${this.token}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: bearer,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: "{}",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `xtraCHEF API ${res.status}: ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`
      );
    }

    return res.json() as Promise<T>;
  }

  /** Fetch the full list of recipe summaries. */
  async fetchRecipeSummaries(): Promise<XCRecipeSummary[]> {
    const url =
      `${API_BASE}/tenants/${this.tenantId}/location/${this.locationId}/recipe-summary?isReGenerate=true`;
    const res = await this.apiFetch<XCRecipeSummaryResponse>(url);

    if (res.exception) {
      throw new Error(`xtraCHEF exception: ${JSON.stringify(res.exception)}`);
    }

    return res.data.recipes;
  }

  /** Fetch full details (including ingredients) for a single recipe. */
  async fetchRecipeDetail(recipeId: number): Promise<XCRecipeDetail> {
    const url =
      `${API_BASE}/${recipeId}/tenants/${this.tenantId}/locations/${this.locationId}/recipe-details?isReGenerate=false`;
    const res = await this.apiFetch<XCRecipeDetailResponse>(url);

    if (res.exception) {
      throw new Error(`xtraCHEF exception for recipe ${recipeId}: ${JSON.stringify(res.exception)}`);
    }

    return res.data;
  }

  /**
   * Fetch all recipes with their ingredients.
   * Makes 1 summary call + N detail calls (one per recipe).
   */
  async fetchAllRecipes(opts?: {
    onProgress?: (done: number, total: number) => void;
  }): Promise<FullRecipe[]> {
    const summaries = await this.fetchRecipeSummaries();
    const total = summaries.length;
    const results: FullRecipe[] = [];

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      opts?.onProgress?.(i + 1, total);

      try {
        const detail = await this.fetchRecipeDetail(summary.recipeId);

        const type: "recipe" | "prep_recipe" =
          summary.type === "Prep Recipe" ? "prep_recipe" : "recipe";

        const recipe: RecipeRow = {
          xtrachef_id: summary.recipeId,
          xtrachef_guid: summary.guid,
          name: detail.name,
          type,
          recipe_group: summary.recipeGroups || detail.basicDetail.recipeGroup || null,
          status: detail.status || summary.status || null,
          menu_price: parseNum(summary.menuPrice),
          prime_cost: parseNum(summary.primeCost),
          food_cost_pct: parseNum(summary.foodCostPercent),
          toast_item_guid: detail.basicDetail.externalMenuItemGuid || summary.externalMenuItemGuid || null,
          serving_size: detail.basicDetail.servingSize || null,
          batch_size: detail.basicDetail.batchSize || null,
          batch_uom: detail.basicDetail.batchUomName || null,
          last_modified_at: detail.lastModified ? new Date(detail.lastModified).toISOString() : null,
          last_modified_by: detail.lastModifiedBy || summary.lastModifiedBy || null,
        };

        const ingredients: RecipeIngredientRow[] = (detail.ingredients || []).map((ing) => ({
          xtrachef_id: ing.id,
          name: ing.name,
          type: ing.type,
          quantity: ing.quantity ?? null,
          uom: ing.uom || null,
          cost: ing.cost ?? null,
          reference_id: ing.referenceId || null,
          reference_guid: ing.referenceGuid || null,
          ingredient_yield: ing.ingredientYield ?? null,
        }));

        results.push({ recipe, ingredients });
      } catch (err) {
        console.error(`  Failed to fetch recipe "${summary.recipe}" (${summary.recipeId}):`, err);
      }
    }

    return results;
  }
}

function parseNum(val: string | number | null | undefined): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}
