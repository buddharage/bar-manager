import { createServerClient } from "@/lib/supabase/server";
import { Snowflake } from "lucide-react";
import { NO_FULL_SPECS_GROUPS } from "@/lib/constants/recipe-groups";
import { stripHtml } from "@/lib/utils";
import { abbreviateUom, convertUnits, unitCategory } from "@/lib/units";

export const dynamic = "force-dynamic";

interface RecipeIngredient {
  id: number;
  name: string;
  type: string;
  quantity: number | null;
  uom: string | null;
  cost: number | null;
  reference_guid: string | null;
}

interface Recipe {
  id: number;
  name: string;
  type: string;
  recipe_group: string | null;
  xtrachef_guid: string;
  serving_size: number | null;
  batch_size: number | null;
  batch_uom: string | null;
  notes: string | null;
  image_url: string | null;
  instructions: string | null;
  on_menu: boolean;
  refrigerate: boolean;
  recipe_ingredients: RecipeIngredient[];
}

/**
 * Given a cocktail recipe, resolve any prep-recipe ingredients into their
 * raw components for a single drink, displayed in oz.
 *
 * For prep-recipe ingredients: compute each sub-ingredient's fraction of the
 * batch total (all converted to oz), then multiply by the amount of that prep
 * used in the cocktail. This guarantees the expanded amounts sum to the
 * cocktail's stated quantity for that prep.
 *
 * Example: cocktail uses 2.5 oz of Batch X.
 *   Batch X = 500ml A + 200ml B + 100ml C = ~27.05 oz total.
 *   A fraction = 16.907/27.05 = 0.625 → 2.5 × 0.625 = 1.5625 oz
 *   Sum of expanded = 2.5 oz ✓
 */
function expandIngredients(
  recipe: Recipe,
  allRecipes: Recipe[]
): Array<{ name: string; quantity: string; uom: string; fromBatch?: string }> {
  const expanded: Array<{
    name: string;
    quantity: string;
    uom: string;
    fromBatch?: string;
  }> = [];

  for (const ing of recipe.recipe_ingredients) {
    if (ing.type === "Prep recipe" && ing.reference_guid) {
      const prep = allRecipes.find(
        (r) => r.xtrachef_guid === ing.reference_guid
      );
      if (prep && prep.recipe_ingredients.length > 0) {
        const usedQty = ing.quantity || 0; // oz used in the cocktail

        // Convert every sub-ingredient to oz to compute fractions
        const subsInOz: { name: string; oz: number; isVolume: boolean }[] =
          prep.recipe_ingredients.map((sub) => {
            const qty = sub.quantity || 0;
            if (sub.uom && unitCategory(sub.uom) === "volume") {
              const converted = convertUnits(qty, sub.uom, "oz");
              return { name: sub.name, oz: converted ?? 0, isVolume: true };
            }
            return { name: sub.name, oz: 0, isVolume: false };
          });

        const totalOz = subsInOz.reduce((sum, s) => sum + s.oz, 0);

        prep.recipe_ingredients.forEach((sub, i) => {
          const info = subsInOz[i];
          if (info.isVolume && totalOz > 0) {
            const fraction = info.oz / totalOz;
            const drinkOz = usedQty * fraction;
            expanded.push({
              name: sub.name,
              quantity: drinkOz ? formatQty(drinkOz) : "",
              uom: "oz",
              fromBatch: prep.name,
            });
          } else {
            // Non-volume ingredient (e.g. grams of sugar): scale by
            // usedQty / batch_size as a fallback
            const batchYield = prep.batch_size || 1;
            const scaledQty = (sub.quantity || 0) * (usedQty / batchYield);
            expanded.push({
              name: sub.name,
              quantity: scaledQty ? formatQty(scaledQty) : "",
              uom: abbreviateUom(sub.uom),
              fromBatch: prep.name,
            });
          }
        });
      } else {
        expanded.push({
          name: ing.name,
          quantity: ing.quantity ? formatQty(ing.quantity) : "",
          uom: abbreviateUom(ing.uom),
        });
      }
    } else {
      // Non-prep ingredient — already per-drink, just normalize UOM
      const qty = ing.quantity || 0;
      if (ing.uom && unitCategory(ing.uom) === "volume") {
        const converted = convertUnits(qty, ing.uom, "oz");
        expanded.push({
          name: ing.name,
          quantity: converted ? formatQty(converted) : "",
          uom: "oz",
        });
      } else {
        expanded.push({
          name: ing.name,
          quantity: qty ? formatQty(qty) : "",
          uom: abbreviateUom(ing.uom),
        });
      }
    }
  }

  return expanded;
}

function formatQty(n: number): string {
  return parseFloat(n.toFixed(3)).toString();
}

function formatInstructions(text: string): string[] {
  return stripHtml(text)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function PrintRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; category?: string }>;
}) {
  const { ids: idsParam, category } = await searchParams;
  const supabase = createServerClient();

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load recipes: {error.message}</p>
      </div>
    );
  }

  const allRecipes = (recipes || []) as Recipe[];

  // Filter to the specific IDs passed from the recipe list
  let printRecipes: Recipe[];
  if (idsParam) {
    const idSet = new Set(idsParam.split(",").map(Number));
    printRecipes = allRecipes.filter((r) => idSet.has(r.id));
  } else {
    // Fallback: show all recipes
    printRecipes = allRecipes;
  }

  const categoryName = category || "All Recipes";

  return (
    <div className="print-page bg-white text-black">
      {/* Table wrapper — thead/tfoot repeat on every printed page */}
      <table className="print-table">
        <thead>
          <tr>
            <th>
              <div className="print-header">
                <span>Witching Hour</span>
                <span>{categoryName}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
      {/* Recipe cards */}
      <div className="print-recipes">
        {printRecipes.map((recipe) => {
          const expanded = expandIngredients(recipe, allRecipes);
          const steps = recipe.instructions
            ? formatInstructions(recipe.instructions)
            : recipe.notes
              ? formatInstructions(recipe.notes)
              : [];

          return (
            <div key={recipe.id} className="recipe-card">
              {/* Header row */}
              <div className="recipe-header">
                <h2 className="recipe-name">{recipe.name}</h2>
                {recipe.refrigerate && (
                  <span className="refrigerate-badge">
                    <Snowflake size={10} />
                    Refrigerate
                  </span>
                )}
              </div>

              <div className="recipe-body">
                {/* Left column: specs + steps */}
                <div className="recipe-content">
                  {/* Specs with batch */}
                  <div className="recipe-section">
                    <h3 className="section-title">Specs</h3>
                    <table className="spec-table">
                      <tbody>
                        {recipe.recipe_ingredients.map((ing) => (
                          <tr key={ing.id}>
                            <td className="spec-qty">
                              {ing.quantity ? formatQty(ing.quantity) : ""}
                            </td>
                            <td className="spec-uom">{abbreviateUom(ing.uom)}</td>
                            <td className="spec-name">
                              {ing.name}
                              {ing.type === "Prep recipe" && (
                                <span className="batch-tag">batch</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Full specs (expanded) — only for cocktails with batch ingredients */}
                  {!NO_FULL_SPECS_GROUPS.includes(recipe.recipe_group || "") &&
                  recipe.recipe_ingredients.some(
                    (i) => i.type === "Prep recipe"
                  ) && (
                    <div className="recipe-section full-specs">
                      <h3 className="section-title">Full Specs (from scratch)</h3>
                      <table className="spec-table">
                        <tbody>
                          {expanded.map((ing, i) => (
                            <tr key={i}>
                              <td className="spec-qty">{ing.quantity}</td>
                              <td className="spec-uom">{ing.uom}</td>
                              <td className="spec-name">
                                {ing.name}
                                {ing.fromBatch && (
                                  <span className="from-batch-tag">
                                    via {ing.fromBatch}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Steps */}
                  {steps.length > 0 && (
                    <div className="recipe-section">
                      <h3 className="section-title">Steps</h3>
                      <ol className="steps-list">
                        {steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                {/* Right column: image */}
                {recipe.image_url && (
                  <div className="recipe-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={recipe.image_url}
                      alt={recipe.name}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
