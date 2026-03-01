/**
 * xtraCHEF Recipe Scraper
 *
 * Uses Playwright to scrape recipe data from xtraCHEF (app.sa.toasttab.com).
 * xtraCHEF has no public API, so we use browser automation with network
 * interception to capture the SPA's internal API responses.
 *
 * Strategy:
 * 1. Launch browser with saved session state (cookies)
 * 2. Navigate to xtraCHEF recipe pages
 * 3. Intercept XHR/fetch responses containing recipe JSON
 * 4. Fall back to DOM scraping if API interception doesn't capture data
 * 5. Return structured recipe/ingredient data
 *
 * First run requires manual login (browser opens visible).
 * Subsequent runs reuse saved session cookies.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import path from "path";
import fs from "fs";

const XTRACHEF_BASE = "https://app.sa.toasttab.com";
const RECIPE_LIST_PATH = "/Recipe/Recipe";
const STATE_DIR = path.join(process.cwd(), ".xtrachef-state");
const STATE_FILE = path.join(STATE_DIR, "auth-state.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedIngredientLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
}

export interface ScrapedRecipe {
  xtrachefId: string | null;
  name: string;
  category: string | null;
  type: "recipe" | "prep_recipe";
  yieldQuantity: number | null;
  yieldUnit: string | null;
  cost: number | null;
  ingredients: ScrapedIngredientLine[];
}

export interface ScrapeResult {
  recipes: ScrapedRecipe[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    // Add to .gitignore if it exists
    const gitignore = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignore)) {
      const content = fs.readFileSync(gitignore, "utf-8");
      if (!content.includes(".xtrachef-state")) {
        fs.appendFileSync(gitignore, "\n# xtraCHEF browser state (session cookies)\n.xtrachef-state/\n");
      }
    }
  }
}

function hasSavedState(): boolean {
  return fs.existsSync(STATE_FILE);
}

/**
 * Wait for the user to finish logging in by checking for a known
 * authenticated element or URL pattern.
 */
async function waitForAuth(page: Page): Promise<void> {
  console.log("\n🔐 Please log in to xtraCHEF in the browser window...\n");
  // xtraCHEF redirects to the dashboard or recipe page after login.
  // Wait for the URL to no longer be a login/auth page.
  await page.waitForURL((url) => {
    const path = url.pathname.toLowerCase();
    return !path.includes("login") && !path.includes("auth") && !path.includes("signin");
  }, { timeout: 300_000 }); // 5 minute timeout for manual login
  console.log("✅ Login detected!\n");
  // Give the SPA time to fully load after auth redirect
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------------------
// Network interception
// ---------------------------------------------------------------------------

/**
 * Collect API responses that look like recipe data.
 * xtraCHEF's SPA makes XHR/fetch calls to internal endpoints —
 * we capture anything that returns JSON with recipe-related fields.
 */
function setupNetworkCapture(page: Page): Map<string, unknown> {
  const captured = new Map<string, unknown>();

  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    if (!contentType.includes("application/json")) return;

    // Only capture responses from the xtraCHEF domain
    if (!url.includes("toasttab.com")) return;

    try {
      const body = await response.json();
      const bodyStr = JSON.stringify(body).toLowerCase();

      // Heuristic: capture responses that contain recipe-related fields
      if (
        bodyStr.includes('"recipe"') ||
        bodyStr.includes('"ingredient"') ||
        bodyStr.includes('"yield"') ||
        bodyStr.includes('"preprecipe"') ||
        url.toLowerCase().includes("recipe")
      ) {
        captured.set(url, body);
      }
    } catch {
      // Response body may not be available; skip
    }
  });

  return captured;
}

// ---------------------------------------------------------------------------
// DOM scraping fallback
// ---------------------------------------------------------------------------

/**
 * Scrape the recipe list from the DOM. This is the fallback when
 * network interception doesn't capture structured API responses.
 *
 * NOTE: DOM selectors are based on the xtraCHEF UI as of 2025.
 * If xtraCHEF updates their UI, these selectors may need adjustment.
 */
async function scrapeRecipeListFromDOM(page: Page): Promise<Array<{ name: string; element: string }>> {
  return page.evaluate(() => {
    const items: Array<{ name: string; element: string }> = [];

    // xtraCHEF recipe list typically renders as a table or card grid.
    // Try multiple selector strategies:

    // Strategy 1: Table rows with recipe names
    const tableRows = document.querySelectorAll("table tbody tr");
    if (tableRows.length > 0) {
      tableRows.forEach((row, i) => {
        const nameCell = row.querySelector("td:first-child");
        if (nameCell?.textContent?.trim()) {
          items.push({
            name: nameCell.textContent.trim(),
            element: `table tbody tr:nth-child(${i + 1})`,
          });
        }
      });
      return items;
    }

    // Strategy 2: List items / cards with recipe data
    const cards = document.querySelectorAll("[class*='recipe'], [data-testid*='recipe'], .recipe-row, .recipe-item");
    cards.forEach((card, i) => {
      const name = card.querySelector("h3, h4, .name, [class*='name'], td:first-child");
      if (name?.textContent?.trim()) {
        items.push({
          name: name.textContent.trim(),
          element: `[class*='recipe']:nth-child(${i + 1})`,
        });
      }
    });

    // Strategy 3: Any clickable rows in the main content area
    if (items.length === 0) {
      const rows = document.querySelectorAll("main tr[class], main [role='row'], .ag-row");
      rows.forEach((row, i) => {
        const firstCell = row.querySelector("td, [role='gridcell'], .ag-cell");
        if (firstCell?.textContent?.trim()) {
          items.push({
            name: firstCell.textContent.trim(),
            element: `main tr:nth-child(${i + 1})`,
          });
        }
      });
    }

    return items;
  });
}

/**
 * Scrape recipe details from the currently open recipe detail view.
 */
async function scrapeRecipeDetailFromDOM(page: Page): Promise<Omit<ScrapedRecipe, "xtrachefId"> | null> {
  return page.evaluate(() => {
    // Find recipe name (usually the largest heading or title in the detail view)
    const nameEl =
      document.querySelector("h1, h2, [class*='recipe-name'], [class*='recipeName'], input[name*='name']");
    const name = nameEl instanceof HTMLInputElement
      ? nameEl.value
      : nameEl?.textContent?.trim() || "";

    if (!name) return null;

    // Find category
    const categoryEl = document.querySelector(
      "[class*='category'] select, [class*='category'] input, select[name*='category']"
    );
    const category = categoryEl instanceof HTMLSelectElement
      ? categoryEl.options[categoryEl.selectedIndex]?.text || null
      : categoryEl instanceof HTMLInputElement
        ? categoryEl.value || null
        : null;

    // Determine type (recipe vs prep recipe)
    const typeEls = document.querySelectorAll(
      "[class*='type'] input[type='radio']:checked, [class*='type'] button[aria-pressed='true'], .active[class*='type']"
    );
    let type: "recipe" | "prep_recipe" = "recipe";
    typeEls.forEach((el) => {
      const text = (el.textContent || (el as HTMLInputElement).value || "").toLowerCase();
      if (text.includes("prep")) type = "prep_recipe";
    });

    // Also check for text-based type indicators
    const allText = document.body.innerText.toLowerCase();
    if (!typeEls.length) {
      // Look for "Prep Recipe" label near the type selector
      const typeLabels = document.querySelectorAll("label, [class*='tab'], [role='tab']");
      typeLabels.forEach((label) => {
        const text = label.textContent?.toLowerCase() || "";
        if (text.includes("prep") && label.classList.contains("active")) {
          type = "prep_recipe";
        }
      });
    }

    // Find yield
    let yieldQuantity: number | null = null;
    let yieldUnit: string | null = null;
    const yieldInputs = document.querySelectorAll(
      "input[name*='yield'], input[placeholder*='yield'], [class*='yield'] input"
    );
    yieldInputs.forEach((input) => {
      const val = (input as HTMLInputElement).value;
      if (val && !isNaN(Number(val))) {
        yieldQuantity = Number(val);
      } else if (val) {
        yieldUnit = val;
      }
    });

    // Find ingredients table
    const ingredients: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      cost: number | null;
    }> = [];

    // Look for ingredient rows in tables
    const ingredientRows = document.querySelectorAll(
      "[class*='ingredient'] tr, table:last-of-type tbody tr, .ingredient-row, [class*='line-item']"
    );

    ingredientRows.forEach((row) => {
      const cells = row.querySelectorAll("td, [class*='cell'], input");
      if (cells.length >= 2) {
        const values: string[] = [];
        cells.forEach((cell) => {
          const val = cell instanceof HTMLInputElement
            ? cell.value
            : cell.textContent?.trim() || "";
          values.push(val);
        });

        // Typical column order: Name, Quantity, Unit, Cost
        const ingredientName = values[0] || "";
        if (!ingredientName || ingredientName.toLowerCase() === "ingredient") return;

        ingredients.push({
          name: ingredientName,
          quantity: values[1] && !isNaN(Number(values[1])) ? Number(values[1]) : null,
          unit: values[2] || null,
          cost: values[3] && !isNaN(Number(values[3].replace("$", "")))
            ? Number(values[3].replace("$", ""))
            : null,
        });
      }
    });

    // Find total cost
    let cost: number | null = null;
    const costEls = document.querySelectorAll(
      "[class*='total-cost'], [class*='totalCost'], [class*='recipe-cost']"
    );
    costEls.forEach((el) => {
      const text = el.textContent?.replace("$", "").trim() || "";
      if (!isNaN(Number(text))) cost = Number(text);
    });

    return { name, category, type, yieldQuantity, yieldUnit, cost, ingredients };
  });
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export async function scrapeXtrachefRecipes(options?: {
  headless?: boolean;
}): Promise<ScrapeResult> {
  const headless = options?.headless ?? false;
  const errors: string[] = [];
  const recipes: ScrapedRecipe[] = [];

  ensureStateDir();

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ headless });

    // Reuse saved session if available
    context = hasSavedState()
      ? await browser.newContext({ storageState: STATE_FILE })
      : await browser.newContext();

    const page = await context.newPage();

    // Set up network interception before any navigation
    const capturedResponses = setupNetworkCapture(page);

    // Navigate to recipe list
    console.log("📡 Navigating to xtraCHEF recipes...");
    await page.goto(`${XTRACHEF_BASE}${RECIPE_LIST_PATH}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Check if we need to log in
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes("login") || currentUrl.includes("auth") || currentUrl.includes("signin")) {
      if (headless) {
        throw new Error(
          "Session expired. Run with --visible flag to log in interactively, " +
          "or delete .xtrachef-state/ and run again."
        );
      }
      await waitForAuth(page);
      // Navigate to recipes after login
      await page.goto(`${XTRACHEF_BASE}${RECIPE_LIST_PATH}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
    }

    // Save session state for next run
    await context.storageState({ path: STATE_FILE });
    console.log("💾 Session state saved for future runs.");

    // Wait for recipe content to load
    await page.waitForTimeout(3000);

    // Check if we captured recipe data from the network
    console.log(`📦 Captured ${capturedResponses.size} API responses with recipe data.`);

    // Try to parse recipes from captured API responses
    let parsedFromApi = false;
    for (const [url, body] of capturedResponses) {
      try {
        const parsed = parseApiResponse(url, body);
        if (parsed.length > 0) {
          recipes.push(...parsed);
          parsedFromApi = true;
          console.log(`  ✅ Parsed ${parsed.length} recipes from ${new URL(url).pathname}`);
        }
      } catch (err) {
        errors.push(`Failed to parse API response from ${url}: ${err}`);
      }
    }

    // If API interception didn't work, fall back to DOM scraping
    if (!parsedFromApi) {
      console.log("🔍 Falling back to DOM scraping...");

      const recipeList = await scrapeRecipeListFromDOM(page);
      console.log(`  Found ${recipeList.length} recipes in the DOM.`);

      for (const item of recipeList) {
        try {
          // Click the recipe to open its detail view
          await page.click(item.element);
          await page.waitForTimeout(2000);

          // Check for new API responses after clicking
          let parsedFromClick = false;
          for (const [url, body] of capturedResponses) {
            const parsed = parseApiResponse(url, body);
            if (parsed.length > 0) {
              // Find the recipe matching the one we clicked
              const match = parsed.find((r) => r.name === item.name);
              if (match && !recipes.some((r) => r.name === match.name)) {
                recipes.push(match);
                parsedFromClick = true;
              }
            }
          }

          // If we still didn't get API data, scrape from DOM
          if (!parsedFromClick) {
            const detail = await scrapeRecipeDetailFromDOM(page);
            if (detail) {
              recipes.push({ ...detail, xtrachefId: null });
            }
          }

          // Go back to recipe list
          await page.goBack({ waitUntil: "networkidle" });
          await page.waitForTimeout(1000);
        } catch (err) {
          errors.push(`Failed to scrape recipe "${item.name}": ${err}`);
        }
      }
    }

    // Save session state again (in case cookies were refreshed)
    await context.storageState({ path: STATE_FILE });

  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }

  console.log(`\n📊 Scrape complete: ${recipes.length} recipes, ${errors.length} errors.`);
  return { recipes, errors };
}

// ---------------------------------------------------------------------------
// API response parsing
// ---------------------------------------------------------------------------

/**
 * Attempt to parse recipe data from an intercepted API response.
 * The exact structure depends on xtraCHEF's internal API — this
 * handles several common patterns.
 */
function parseApiResponse(url: string, body: unknown): ScrapedRecipe[] {
  const recipes: ScrapedRecipe[] = [];

  if (!body || typeof body !== "object") return recipes;

  // If the response is an array, try each element
  const items = Array.isArray(body)
    ? body
    : (body as Record<string, unknown>).data
      ? Array.isArray((body as Record<string, unknown>).data)
        ? (body as Record<string, unknown>).data as unknown[]
        : [(body as Record<string, unknown>).data]
      : (body as Record<string, unknown>).results
        ? (body as Record<string, unknown>).results as unknown[]
        : (body as Record<string, unknown>).recipes
          ? (body as Record<string, unknown>).recipes as unknown[]
          : [body];

  for (const item of items as Array<Record<string, unknown>>) {
    if (!item || typeof item !== "object") continue;

    // Check if this looks like a recipe object
    const name = (item.name || item.recipeName || item.Name || item.RecipeName) as string | undefined;
    if (!name) continue;

    const typeRaw = ((item.type || item.recipeType || item.Type || item.RecipeType || "") as string).toLowerCase();
    const type: "recipe" | "prep_recipe" = typeRaw.includes("prep") ? "prep_recipe" : "recipe";

    const category = (item.category || item.Category || item.categoryName || item.CategoryName) as string | null;

    // Parse yield
    const yieldObj = item.yield || item.Yield || {};
    const yieldQuantity = typeof yieldObj === "object"
      ? Number((yieldObj as Record<string, unknown>).quantity || (yieldObj as Record<string, unknown>).Quantity) || null
      : typeof item.yieldQuantity === "number" ? item.yieldQuantity as number : null;
    const yieldUnit = typeof yieldObj === "object"
      ? ((yieldObj as Record<string, unknown>).unit || (yieldObj as Record<string, unknown>).Unit) as string | null
      : (item.yieldUnit as string) || null;

    // Parse cost
    const cost = Number(item.cost || item.Cost || item.totalCost || item.TotalCost) || null;

    // Parse ingredients
    const ingredientLines: ScrapedIngredientLine[] = [];
    const rawIngredients = (
      item.ingredients || item.Ingredients ||
      item.recipeIngredients || item.RecipeIngredients ||
      item.lines || item.Lines || []
    ) as Array<Record<string, unknown>>;

    for (const ing of rawIngredients) {
      if (!ing || typeof ing !== "object") continue;
      const ingName = (
        ing.name || ing.Name ||
        ing.ingredientName || ing.IngredientName ||
        ing.itemName || ing.ItemName
      ) as string | undefined;
      if (!ingName) continue;

      ingredientLines.push({
        name: ingName,
        quantity: Number(ing.quantity || ing.Quantity || ing.qty || ing.Qty) || null,
        unit: (ing.unit || ing.Unit || ing.unitOfMeasure || ing.UnitOfMeasure) as string | null,
        cost: Number(ing.cost || ing.Cost || ing.lineCost || ing.LineCost) || null,
      });
    }

    const id = (item.id || item.Id || item.recipeId || item.RecipeId || item.guid || item.Guid) as string | null;

    recipes.push({
      xtrachefId: id ? String(id) : null,
      name,
      category: category || null,
      type,
      yieldQuantity,
      yieldUnit,
      cost,
      ingredients: ingredientLines,
    });
  }

  return recipes;
}
