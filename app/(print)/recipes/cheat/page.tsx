import { createServerClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/utils";
import { abbreviateUom } from "@/lib/units";

export const dynamic = "force-dynamic";

interface RecipeIngredient {
  id: number;
  name: string;
  type: string;
  quantity: number | null;
  uom: string | null;
}

interface Recipe {
  id: number;
  name: string;
  recipe_group: string | null;
  instructions: string | null;
  notes: string | null;
  recipe_ingredients: RecipeIngredient[];
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

export default async function CheatSheetPage() {
  const supabase = createServerClient();

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("recipe_group", "House Cocktails")
    .eq("on_menu", true)
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load recipes: {error.message}</p>
      </div>
    );
  }

  const cocktails = (recipes || []) as Recipe[];

  return (
    <div className="cheat-page">
      <div className="cheat-header">
        <span>Witching Hour</span>
        <span>House Cocktails Cheat Sheet</span>
      </div>
      <div className="cheat-grid">
        {cocktails.map((recipe) => {
          const steps = recipe.instructions
            ? formatInstructions(recipe.instructions)
            : recipe.notes
              ? formatInstructions(recipe.notes)
              : [];

          return (
            <div key={recipe.id} className="cheat-card">
              <h2 className="cheat-name">{recipe.name}</h2>

              <table className="cheat-specs">
                <tbody>
                  {recipe.recipe_ingredients.map((ing) => (
                    <tr key={ing.id}>
                      <td className="cheat-qty">
                        {ing.quantity ? formatQty(ing.quantity) : ""}
                      </td>
                      <td className="cheat-uom">{abbreviateUom(ing.uom)}</td>
                      <td className="cheat-ing">{ing.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {steps.length > 0 && (
                <ol className="cheat-steps">
                  {steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
