import { describe, it, expect, vi, beforeEach } from "vitest";
import { XtrachefClient } from "./xtrachef-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

const SUMMARY_RESPONSE = {
  data: {
    totalRowCount: 2,
    recipes: [
      {
        recipeId: 101,
        guid: "guid-101",
        recipe: "Margarita",
        status: "Active",
        recipeGroups: "Cocktails",
        type: "Recipe",
        menuPrice: "14.00",
        primeCost: "3.50",
        foodCostPercent: "25.0",
        lastModified: "2025-06-01T12:00:00Z",
        lastModifiedBy: "chef@bar.com",
        posId: null,
        externalMenuItemGuid: "toast-guid-1",
      },
      {
        recipeId: 202,
        guid: "guid-202",
        recipe: "Simple Syrup",
        status: "Active",
        recipeGroups: "Prep",
        type: "Prep Recipe",
        menuPrice: null,
        primeCost: "1.20",
        foodCostPercent: null,
        lastModified: "2025-05-15T10:00:00Z",
        lastModifiedBy: "chef@bar.com",
        posId: null,
        externalMenuItemGuid: null,
      },
    ],
  },
  exception: null,
};

const DETAIL_101 = {
  data: {
    id: 101,
    guid: "guid-101",
    name: "Margarita",
    status: "Active",
    lastModified: "2025-06-01T12:00:00Z",
    lastModifiedBy: "chef@bar.com",
    basicDetail: {
      type: "Recipe",
      recipeGroup: "Cocktails",
      externalMenuItemGuid: "toast-guid-1",
      menuPrice: 14,
      servingSize: 1,
      batchSize: null,
      batchUomId: null,
      batchUomName: null,
    },
    stats: { menuPrice: 14, foodCost: 3.5, foodCostPercent: 25 },
    ingredients: [
      {
        id: 1001,
        referenceId: "ref-1",
        referenceGuid: "ref-guid-1",
        type: "Ingredient",
        name: "Tequila Blanco",
        quantity: 2,
        uomId: 5,
        uom: "oz",
        ingredientYield: 1,
        consumablePortion: 1,
        cost: 1.8,
      },
      {
        id: 1002,
        referenceId: "ref-2",
        referenceGuid: "ref-guid-2",
        type: "Ingredient",
        name: "Lime Juice",
        quantity: 1,
        uomId: 5,
        uom: "oz",
        ingredientYield: 1,
        consumablePortion: 1,
        cost: 0.5,
      },
    ],
  },
  exception: null,
};

const DETAIL_202 = {
  data: {
    id: 202,
    guid: "guid-202",
    name: "Simple Syrup",
    status: "Active",
    lastModified: "2025-05-15T10:00:00Z",
    lastModifiedBy: "chef@bar.com",
    basicDetail: {
      type: "Prep Recipe",
      recipeGroup: "Prep",
      externalMenuItemGuid: null,
      menuPrice: 0,
      servingSize: null,
      batchSize: 32,
      batchUomId: 5,
      batchUomName: "oz",
    },
    stats: { menuPrice: 0, foodCost: 1.2, foodCostPercent: 0 },
    ingredients: [
      {
        id: 2001,
        referenceId: "ref-3",
        referenceGuid: "ref-guid-3",
        type: "Ingredient",
        name: "Sugar",
        quantity: 16,
        uomId: 5,
        uom: "oz",
        ingredientYield: 1,
        consumablePortion: 1,
        cost: 0.6,
      },
    ],
  },
  exception: null,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("XtrachefClient", () => {
  describe("Bearer token normalization", () => {
    it("adds Bearer prefix when token does not include it", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE));

      const client = new XtrachefClient({
        tenantId: "123",
        locationId: "456",
        token: "my-raw-token",
      });

      await client.fetchRecipeSummaries();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer my-raw-token",
          }),
        }),
      );
    });

    it("does not double-prefix when token already starts with Bearer", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE));

      const client = new XtrachefClient({
        tenantId: "123",
        locationId: "456",
        token: "Bearer already-prefixed",
      });

      await client.fetchRecipeSummaries();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer already-prefixed",
          }),
        }),
      );
    });
  });

  describe("fetchRecipeSummaries", () => {
    it("returns parsed recipe summaries", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const result = await client.fetchRecipeSummaries();

      expect(result).toHaveLength(2);
      expect(result[0].recipeId).toBe(101);
      expect(result[0].recipe).toBe("Margarita");
      expect(result[1].type).toBe("Prep Recipe");
    });

    it("calls the correct URL with tenant and location", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      await client.fetchRecipeSummaries();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://ecs-api-prod.sa.toasttab.com/api.recipes-query/api/1.0/recipes-v2/tenants/39494/location/12802/recipe-summary?isReGenerate=true",
        expect.any(Object),
      );
    });

    it("throws on API exception in response body", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: { totalRowCount: 0, recipes: [] },
          exception: { message: "Unauthorized" },
        }),
      );

      const client = new XtrachefClient({
        tenantId: "123",
        locationId: "456",
        token: "bad-token",
      });

      await expect(client.fetchRecipeSummaries()).rejects.toThrow("xtraCHEF exception");
    });
  });

  describe("fetchRecipeDetail", () => {
    it("returns parsed recipe detail with ingredients", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(DETAIL_101));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const result = await client.fetchRecipeDetail(101);

      expect(result.id).toBe(101);
      expect(result.name).toBe("Margarita");
      expect(result.ingredients).toHaveLength(2);
      expect(result.ingredients[0].name).toBe("Tequila Blanco");
      expect(result.ingredients[0].cost).toBe(1.8);
    });

    it("calls the correct detail URL", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(DETAIL_101));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      await client.fetchRecipeDetail(101);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://ecs-api-prod.sa.toasttab.com/api.recipes-query/api/1.0/recipes-v2/101/tenants/39494/locations/12802/recipe-details?isReGenerate=false",
        expect.any(Object),
      );
    });
  });

  describe("fetchAllRecipes", () => {
    it("fetches summaries then details for each recipe", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(DETAIL_101))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 summary + 2 details
    });

    it("maps recipe types correctly", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(DETAIL_101))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();

      expect(results[0].recipe.type).toBe("recipe");
      expect(results[1].recipe.type).toBe("prep_recipe");
    });

    it("maps recipe fields correctly", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(DETAIL_101))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();
      const margarita = results[0].recipe;

      expect(margarita.xtrachef_id).toBe(101);
      expect(margarita.xtrachef_guid).toBe("guid-101");
      expect(margarita.name).toBe("Margarita");
      expect(margarita.recipe_group).toBe("Cocktails");
      expect(margarita.menu_price).toBe(14);
      expect(margarita.prime_cost).toBe(3.5);
      expect(margarita.food_cost_pct).toBe(25);
      expect(margarita.toast_item_guid).toBe("toast-guid-1");
    });

    it("maps ingredient fields correctly", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(DETAIL_101))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();
      const tequila = results[0].ingredients[0];

      expect(tequila.xtrachef_id).toBe(1001);
      expect(tequila.name).toBe("Tequila Blanco");
      expect(tequila.type).toBe("Ingredient");
      expect(tequila.quantity).toBe(2);
      expect(tequila.uom).toBe("oz");
      expect(tequila.cost).toBe(1.8);
      expect(tequila.reference_guid).toBe("ref-guid-1");
    });

    it("calls onProgress callback for each recipe", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(DETAIL_101))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const progress: Array<[number, number]> = [];
      await client.fetchAllRecipes({
        onProgress: (done, total) => progress.push([done, total]),
      });

      expect(progress).toEqual([
        [1, 2],
        [2, 2],
      ]);
    });

    it("continues when a single recipe detail fetch fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockFetch
        .mockResolvedValueOnce(jsonResponse(SUMMARY_RESPONSE))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();

      expect(results).toHaveLength(1);
      expect(results[0].recipe.name).toBe("Simple Syrup");

      consoleSpy.mockRestore();
    });
  });

  describe("HTTP error handling", () => {
    it("throws on non-OK response with status info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Token expired"),
      });

      const client = new XtrachefClient({
        tenantId: "123",
        locationId: "456",
        token: "expired-token",
      });

      await expect(client.fetchRecipeSummaries()).rejects.toThrow(
        "xtraCHEF API 401: Unauthorized",
      );
    });

    it("includes response body snippet in error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Something went wrong"),
      });

      const client = new XtrachefClient({
        tenantId: "123",
        locationId: "456",
        token: "test-token",
      });

      await expect(client.fetchRecipeSummaries()).rejects.toThrow(
        "Something went wrong",
      );
    });
  });

  describe("parseNum", () => {
    it("handles null menuPrice as null", async () => {
      const summaryWithNull = {
        ...SUMMARY_RESPONSE,
        data: {
          totalRowCount: 1,
          recipes: [{ ...SUMMARY_RESPONSE.data.recipes[1] }], // Simple Syrup has null menuPrice
        },
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(summaryWithNull))
        .mockResolvedValueOnce(jsonResponse(DETAIL_202));

      const client = new XtrachefClient({
        tenantId: "39494",
        locationId: "12802",
        token: "test-token",
      });

      const results = await client.fetchAllRecipes();
      expect(results[0].recipe.menu_price).toBeNull(); // summary.menuPrice is null → parseNum(null) → null
      expect(results[0].recipe.food_cost_pct).toBeNull(); // summary.foodCostPercent is null
    });
  });
});
