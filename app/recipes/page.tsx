import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface RecipeIngredient {
  id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
  sub_recipe_id: number | null;
}

interface Recipe {
  id: number;
  name: string;
  category: string | null;
  type: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  cost: number | null;
  last_synced_at: string | null;
  recipe_ingredients: RecipeIngredient[];
}

export default async function RecipesPage() {
  const supabase = createServerClient();

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("type", { ascending: true })
    .order("category", { ascending: true })
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

  const allRecipes = (recipes || []) as Recipe[];
  const mainRecipes = allRecipes.filter((r) => r.type === "recipe");
  const prepRecipes = allRecipes.filter((r) => r.type === "prep_recipe");
  const categories = [...new Set(allRecipes.map((r) => r.category || "Uncategorized"))];

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
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingredients
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
              Run <code className="rounded bg-muted px-1.5 py-0.5">npx tsx scripts/sync-xtrachef.ts</code>{" "}
              to import recipes from xtraCHEF.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Recipes grouped by category */}
          {categories.map((category) => {
            const categoryRecipes = allRecipes.filter(
              (r) => (r.category || "Uncategorized") === category
            );

            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{category}</span>
                    <Badge variant="secondary">{categoryRecipes.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Yield</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Ingredients</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryRecipes.map((recipe) => (
                        <TableRow key={recipe.id}>
                          <TableCell className="font-medium">{recipe.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={recipe.type === "prep_recipe" ? "default" : "secondary"}
                            >
                              {recipe.type === "prep_recipe" ? "Prep" : "Recipe"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {recipe.yield_quantity
                              ? `${recipe.yield_quantity} ${recipe.yield_unit || ""}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe.cost != null
                              ? `$${Number(recipe.cost).toFixed(2)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe.recipe_ingredients?.length || 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Expandable ingredient details per recipe */}
                  {categoryRecipes.map((recipe) =>
                    recipe.recipe_ingredients?.length > 0 ? (
                      <details key={`ing-${recipe.id}`} className="mt-2 ml-4 text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          {recipe.name} ingredients ({recipe.recipe_ingredients.length})
                        </summary>
                        <div className="mt-1 pl-4 border-l">
                          {recipe.recipe_ingredients.map((ing) => (
                            <div key={ing.id} className="flex gap-4 py-0.5">
                              <span className="flex-1">
                                {ing.sub_recipe_id ? (
                                  <Badge variant="outline" className="mr-1 text-xs">prep</Badge>
                                ) : null}
                                {ing.name}
                              </span>
                              <span className="text-muted-foreground">
                                {ing.quantity ?? "—"} {ing.unit || ""}
                              </span>
                              <span className="text-muted-foreground w-16 text-right">
                                {ing.cost != null ? `$${Number(ing.cost).toFixed(2)}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
