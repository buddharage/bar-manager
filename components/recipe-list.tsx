"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  recipe_ingredients: RecipeIngredient[];
}

function costBadge(pct: number | null) {
  if (pct == null) return null;
  const n = Number(pct);
  if (n > 30) return <Badge variant="destructive">{n.toFixed(1)}%</Badge>;
  if (n > 20) return <Badge variant="default">{n.toFixed(1)}%</Badge>;
  return <Badge variant="secondary">{n.toFixed(1)}%</Badge>;
}

export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const guidToRecipeId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recipes) {
      map.set(r.xtrachef_guid, r.id);
    }
    return map;
  }, [recipes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return recipes;
    const q = search.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, search]);

  const groups = useMemo(
    () => [...new Set(filtered.map((r) => r.recipe_group || "Uncategorized"))],
    [filtered],
  );

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Search + group nav */}
      <div className="sticky top-0 z-10 bg-background pb-3 space-y-3 border-b">
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <a
              key={group}
              href={`#group-${group.replace(/\s+/g, "-")}`}
              className="inline-block"
            >
              <Badge variant="outline" className="cursor-pointer hover:bg-accent text-xs">
                {group}
              </Badge>
            </a>
          ))}
        </div>
      </div>

      {filtered.length === 0 && search.trim() && (
        <p className="text-sm text-muted-foreground py-4">
          No recipes matching &quot;{search}&quot;
        </p>
      )}

      {groups.map((group) => {
        const groupRecipes = filtered.filter(
          (r) => (r.recipe_group || "Uncategorized") === group,
        );

        return (
          <Card key={group} id={`group-${group.replace(/\s+/g, "-")}`}>
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
                    <TableHead>Toast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRecipes.map((recipe) => {
                    const hasIngredients = recipe.recipe_ingredients?.length > 0;
                    const isExpanded = expandedIds.has(recipe.id);

                    return (
                      <ExpandableRecipeRow
                        key={recipe.id}
                        recipe={recipe}
                        hasIngredients={hasIngredients}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpanded(recipe.id)}
                        guidToRecipeId={guidToRecipeId}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ExpandableRecipeRow({
  recipe,
  hasIngredients,
  isExpanded,
  onToggle,
  guidToRecipeId,
}: {
  recipe: Recipe;
  hasIngredients: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  guidToRecipeId: Map<string, number>;
}) {
  return (
    <>
      <TableRow
        id={`recipe-${recipe.id}`}
        className={hasIngredients ? "cursor-pointer hover:bg-muted/50" : ""}
        onClick={hasIngredients ? onToggle : undefined}
      >
        <TableCell className="font-medium">
          <span className="flex items-center gap-1.5">
            {hasIngredients && (
              <span className="text-muted-foreground text-xs w-4 inline-block">
                {isExpanded ? "▼" : "▶"}
              </span>
            )}
            {recipe.name}
          </span>
        </TableCell>
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

      {isExpanded && (recipe.notes || recipe.serving_size != null || recipe.instructions || recipe.image_url) && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="py-3 px-10">
            <div className="flex gap-6">
              {recipe.image_url && (
                <img
                  src={recipe.image_url}
                  alt={recipe.name}
                  className="w-24 h-24 object-cover rounded"
                />
              )}
              <div className="space-y-1.5 text-sm">
                {recipe.serving_size != null && (
                  <p>
                    <span className="font-medium text-muted-foreground">Serving Size:</span>{" "}
                    {Number(recipe.serving_size)}
                  </p>
                )}
                {recipe.notes && (
                  <p>
                    <span className="font-medium text-muted-foreground">Notes:</span>{" "}
                    {recipe.notes}
                  </p>
                )}
                {recipe.instructions && (
                  <div>
                    <span className="font-medium text-muted-foreground">Instructions:</span>{" "}
                    <span className="whitespace-pre-line">{recipe.instructions}</span>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {isExpanded && recipe.recipe_ingredients.map((ing) => {
        const linkedRecipeId =
          ing.type === "Prep recipe" && ing.reference_guid
            ? guidToRecipeId.get(ing.reference_guid)
            : undefined;

        return (
          <TableRow key={ing.id} className="bg-muted/30">
            <TableCell className="pl-10 text-sm">
              {linkedRecipeId != null ? (
                <a
                  href={`#recipe-${linkedRecipeId}`}
                  className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ing.name}
                </a>
              ) : (
                ing.name
              )}
            </TableCell>
            <TableCell>
              {ing.type === "Prep recipe" ? (
                <Badge variant="outline" className="text-xs">
                  prep
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {ing.type}
                </span>
              )}
            </TableCell>
            <TableCell className="text-sm text-right">
              {ing.quantity ?? "—"}
            </TableCell>
            <TableCell className="text-sm" colSpan={2}>
              {ing.uom || "—"}
            </TableCell>
            <TableCell className="text-sm text-right">
              {ing.cost != null ? `$${Number(ing.cost).toFixed(4)}` : "—"}
            </TableCell>
            <TableCell />
          </TableRow>
        );
      })}
    </>
  );
}
