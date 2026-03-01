import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecipeList } from "@/components/recipe-list";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const supabase = createServerClient();

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("type", { ascending: true })
    .order("recipe_group", { ascending: true })
    .order("name", { ascending: true });

  const { count: ingredientCount } = await supabase
    .from("ingredients")
    .select("*", { count: "exact", head: true });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load recipes: {error.message}</p>
      </div>
    );
  }

  const allRecipes = (recipes || []) as Array<{
    id: number;
    xtrachef_id: number;
    xtrachef_guid: string;
    name: string;
    type: string;
    recipe_group: string | null;
    status: string | null;
    menu_price: number | null;
    prime_cost: number | null;
    food_cost_pct: number | null;
    toast_item_guid: string | null;
    serving_size: number | null;
    notes: string | null;
    image_url: string | null;
    instructions: string | null;
    last_synced_at: string | null;
    recipe_ingredients: Array<{
      id: number;
      name: string;
      type: string;
      quantity: number | null;
      uom: string | null;
      cost: number | null;
      reference_guid: string | null;
    }>;
  }>;

  const mainRecipes = allRecipes.filter((r) => r.type === "recipe");
  const prepRecipes = allRecipes.filter((r) => r.type === "prep_recipe");

  const lastSync = allRecipes.reduce<string | null>((latest, r) => {
    if (!r.last_synced_at) return latest;
    if (!latest) return r.last_synced_at;
    return r.last_synced_at > latest ? r.last_synced_at : latest;
  }, null);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">{mainRecipes.length} recipes</Badge>
          <Badge variant="secondary">{prepRecipes.length} prep</Badge>
          <Badge variant="secondary">{ingredientCount || 0} ingredients</Badge>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mainRecipes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prep Recipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{prepRecipes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {[...new Set(allRecipes.map((r) => r.recipe_group || "Uncategorized"))].length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Raw Ingredients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ingredientCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      {lastSync && (
        <p className="text-sm text-muted-foreground">
          Last synced from xtraCHEF: {new Date(lastSync).toLocaleString()}
        </p>
      )}

      {allRecipes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">
              No recipes synced yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Go to <a href="/settings" className="underline">Settings</a> to configure
              xtraCHEF and sync your recipes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <RecipeList recipes={allRecipes} />
      )}
    </div>
  );
}
