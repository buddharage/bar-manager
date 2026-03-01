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
  type: string;
  quantity: number | null;
  uom: string | null;
  cost: number | null;
  reference_guid: string | null;
}

interface Recipe {
  id: number;
  xtrachef_id: number;
  name: string;
  type: string;
  recipe_group: string | null;
  status: string | null;
  menu_price: number | null;
  prime_cost: number | null;
  food_cost_pct: number | null;
  toast_item_guid: string | null;
  last_synced_at: string | null;
  recipe_ingredients: RecipeIngredient[];
}

function costBadge(pct: number | null) {
  if (pct == null) return null;
  const n = Number(pct);
  if (n > 30) return <Badge variant="destructive">{n.toFixed(1)}%</Badge>;
  if (n > 20) return <Badge variant="default">{n.toFixed(1)}%</Badge>;
  return <Badge variant="secondary">{n.toFixed(1)}%</Badge>;
}

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

  const allRecipes = (recipes || []) as Recipe[];
  const mainRecipes = allRecipes.filter((r) => r.type === "recipe");
  const prepRecipes = allRecipes.filter((r) => r.type === "prep_recipe");
  const groups = [...new Set(allRecipes.map((r) => r.recipe_group || "Uncategorized"))];

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
            <div className="text-2xl font-bold">{groups.length}</div>
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
        <>
          {groups.map((group) => {
            const groupRecipes = allRecipes.filter(
              (r) => (r.recipe_group || "Uncategorized") === group,
            );

            return (
              <Card key={group}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{group}</span>
                    <Badge variant="secondary">{groupRecipes.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Food Cost</TableHead>
                        <TableHead className="text-right">Cost %</TableHead>
                        <TableHead>Toast Item</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupRecipes.map((recipe) => (
                        <TableRow key={recipe.id}>
                          <TableCell className="font-medium">{recipe.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={recipe.type === "prep_recipe" ? "default" : "secondary"}
                            >
                              {recipe.type === "prep_recipe" ? "Prep" : "Recipe"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {recipe.status || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe.menu_price != null
                              ? `$${Number(recipe.menu_price).toFixed(2)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {recipe.prime_cost != null
                              ? `$${Number(recipe.prime_cost).toFixed(2)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {costBadge(recipe.food_cost_pct)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {recipe.toast_item_guid ? "Linked" : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Expandable ingredient details */}
                  {groupRecipes.map((recipe) =>
                    recipe.recipe_ingredients?.length > 0 ? (
                      <details key={`ing-${recipe.id}`} className="mt-2 ml-4 text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          {recipe.name} — {recipe.recipe_ingredients.length} ingredients
                          {recipe.prime_cost != null && (
                            <span className="ml-2">
                              (total: ${Number(recipe.prime_cost).toFixed(2)})
                            </span>
                          )}
                        </summary>
                        <Table className="mt-1">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Ingredient</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead>UOM</TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {recipe.recipe_ingredients.map((ing) => (
                              <TableRow key={ing.id}>
                                <TableCell>{ing.name}</TableCell>
                                <TableCell>
                                  {ing.type === "Prep recipe" ? (
                                    <Badge variant="outline" className="text-xs">prep</Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">{ing.type}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {ing.quantity ?? "—"}
                                </TableCell>
                                <TableCell>{ing.uom || "—"}</TableCell>
                                <TableCell className="text-right">
                                  {ing.cost != null ? `$${Number(ing.cost).toFixed(4)}` : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </details>
                    ) : null,
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
