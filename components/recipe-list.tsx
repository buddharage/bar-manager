"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  menu_price: number | null;
  prime_cost: number | null;
  food_cost_pct: number | null;
  toast_item_guid: string | null;
  serving_size: number | null;
  notes: string | null;
  image_url: string | null;
  instructions: string | null;
  on_menu: boolean;
  refrigerate: boolean;
  creator: string | null;
  created_at_label: string | null;
  recipe_ingredients: RecipeIngredient[];
}

// ---------------------------------------------------------------------------
// Sortable column definitions
// ---------------------------------------------------------------------------

type SortKey =
  | "name"
  | "menu_price"
  | "prime_cost"
  | "food_cost_pct"
  | "on_menu"
  | "refrigerate"
  | "creator"
  | "created_at_label";
type SortDir = "asc" | "desc";

function compare(a: unknown, b: unknown, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * mul;
  }
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  return String(a).localeCompare(String(b)) * mul;
}

function costBadge(pct: number | null) {
  if (pct == null) return null;
  const n = Number(pct);
  if (n > 30) return <Badge variant="destructive">{n.toFixed(1)}%</Badge>;
  if (n > 20) return <Badge variant="default">{n.toFixed(1)}%</Badge>;
  return <Badge variant="secondary">{n.toFixed(1)}%</Badge>;
}

// ---------------------------------------------------------------------------
// Inline-editable cell with autocomplete datalist
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  options,
  onSave,
  placeholder,
}: {
  value: string | null;
  options: string[];
  onSave: (val: string | null) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useRef(`dl-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    if (newVal !== value) onSave(newVal);
    setEditing(false);
  }

  if (editing) {
    return (
      <span onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          list={listId.current}
          className="w-full bg-transparent border-b border-foreground/30 outline-none text-sm py-0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value || "");
              setEditing(false);
            }
          }}
        />
        <datalist id={listId.current}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </span>
    );
  }

  return (
    <span
      className="cursor-pointer hover:underline underline-offset-2 text-sm"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value || "");
        setEditing(true);
      }}
      title="Click to edit"
    >
      {value || <span className="text-muted-foreground italic">{placeholder || "—"}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort header component
// ---------------------------------------------------------------------------

function SortableHead({
  label,
  sortKey,
  currentSort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort?.key === sortKey;
  const arrow = active ? (currentSort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className || ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {arrow && <span className="text-xs ml-0.5">{arrow}</span>}
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Main RecipeList component
// ---------------------------------------------------------------------------

const COL_COUNT = 8; // total visible columns

export function RecipeList({ recipes: initialRecipes }: { recipes: Recipe[] }) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // Filters
  const [filterOnMenu, setFilterOnMenu] = useState<"" | "yes" | "no">("");
  const [filterCreator, setFilterCreator] = useState("");
  const [filterCreatedAt, setFilterCreatedAt] = useState("");

  // Unique values for filter dropdowns and autocomplete
  const creatorOptions = useMemo(
    () => [...new Set(recipes.map((r) => r.creator).filter(Boolean))] as string[],
    [recipes],
  );
  const createdAtOptions = useMemo(
    () => [...new Set(recipes.map((r) => r.created_at_label).filter(Boolean))] as string[],
    [recipes],
  );

  const guidToRecipeId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recipes) map.set(r.xtrachef_guid, r.id);
    return map;
  }, [recipes]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = recipes;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filterOnMenu === "yes") list = list.filter((r) => r.on_menu);
    if (filterOnMenu === "no") list = list.filter((r) => !r.on_menu);
    if (filterCreator) list = list.filter((r) => r.creator === filterCreator);
    if (filterCreatedAt) list = list.filter((r) => r.created_at_label === filterCreatedAt);

    return list;
  }, [recipes, search, filterOnMenu, filterCreator, filterCreatedAt]);

  const groups = useMemo(
    () => [...new Set(filtered.map((r) => r.recipe_group || "Uncategorized"))],
    [filtered],
  );

  // Sort within groups
  function sortRecipes(list: Recipe[]): Recipe[] {
    if (!sort) return list;
    return [...list].sort((a, b) =>
      compare(a[sort.key], b[sort.key], sort.dir),
    );
  }

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        if (prev.dir === "asc") return { key, dir: "desc" };
        return null; // toggle off
      }
      return { key, dir: "asc" };
    });
  }

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Persist an editable field update
  const updateRecipe = useCallback(
    async (id: number, field: string, value: unknown) => {
      // Optimistic update
      setRecipes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      );

      try {
        await fetch(`/api/recipes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
      } catch {
        // Revert on failure — reload would also work
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, [field]: initialRecipes.find((ir) => ir.id === id)?.[field as keyof Recipe] ?? null }
              : r,
          ),
        );
      }
    },
    [initialRecipes],
  );

  const hasActiveFilters = filterOnMenu || filterCreator || filterCreatedAt;

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="sticky top-0 z-10 bg-background pb-3 space-y-3 border-b">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          {/* On Menu filter */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">On Menu</label>
            <select
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filterOnMenu}
              onChange={(e) => setFilterOnMenu(e.target.value as "" | "yes" | "no")}
            >
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* Creator filter */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Creator</label>
            <select
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filterCreator}
              onChange={(e) => setFilterCreator(e.target.value)}
            >
              <option value="">All</option>
              {creatorOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Created At filter */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Created At</label>
            <select
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filterCreatedAt}
              onChange={(e) => setFilterCreatedAt(e.target.value)}
            >
              <option value="">All</option>
              {createdAtOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterOnMenu("");
                setFilterCreator("");
                setFilterCreatedAt("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

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

      {filtered.length === 0 && (search.trim() || hasActiveFilters) && (
        <p className="text-sm text-muted-foreground py-4">
          No recipes matching current filters.
        </p>
      )}

      {groups.map((group) => {
        const groupRecipes = sortRecipes(
          filtered.filter((r) => (r.recipe_group || "Uncategorized") === group),
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
                    <SortableHead label="Name" sortKey="name" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Price" sortKey="menu_price" currentSort={sort} onSort={handleSort} className="text-right" />
                    <SortableHead label="Cost" sortKey="prime_cost" currentSort={sort} onSort={handleSort} className="text-right" />
                    <SortableHead label="Cost %" sortKey="food_cost_pct" currentSort={sort} onSort={handleSort} className="text-right" />
                    <SortableHead label="On Menu" sortKey="on_menu" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Refrigerate" sortKey="refrigerate" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Creator" sortKey="creator" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Created At" sortKey="created_at_label" currentSort={sort} onSort={handleSort} />
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
                        creatorOptions={creatorOptions}
                        createdAtOptions={createdAtOptions}
                        onUpdate={updateRecipe}
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

// ---------------------------------------------------------------------------
// Expandable recipe row
// ---------------------------------------------------------------------------

function ExpandableRecipeRow({
  recipe,
  hasIngredients,
  isExpanded,
  onToggle,
  guidToRecipeId,
  creatorOptions,
  createdAtOptions,
  onUpdate,
}: {
  recipe: Recipe;
  hasIngredients: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  guidToRecipeId: Map<string, number>;
  creatorOptions: string[];
  createdAtOptions: string[];
  onUpdate: (id: number, field: string, value: unknown) => void;
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

        {/* On Menu — click to toggle */}
        <TableCell>
          <Badge
            variant={recipe.on_menu ? "default" : "outline"}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(recipe.id, "on_menu", !recipe.on_menu);
            }}
          >
            {recipe.on_menu ? "Yes" : "No"}
          </Badge>
        </TableCell>

        {/* Refrigerate — click to toggle */}
        <TableCell>
          <Badge
            variant={recipe.refrigerate ? "default" : "outline"}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(recipe.id, "refrigerate", !recipe.refrigerate);
            }}
          >
            {recipe.refrigerate ? "Yes" : "No"}
          </Badge>
        </TableCell>

        {/* Creator — editable */}
        <TableCell>
          <EditableCell
            value={recipe.creator}
            options={creatorOptions}
            onSave={(val) => onUpdate(recipe.id, "creator", val)}
            placeholder="Add..."
          />
        </TableCell>

        {/* Created At — editable */}
        <TableCell>
          <EditableCell
            value={recipe.created_at_label}
            options={createdAtOptions}
            onSave={(val) => onUpdate(recipe.id, "created_at_label", val)}
            placeholder="Add..."
          />
        </TableCell>
      </TableRow>

      {isExpanded && (recipe.notes || recipe.serving_size != null || recipe.instructions || recipe.image_url) && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={COL_COUNT} className="py-3 px-10">
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
              <span className="flex items-center gap-1.5">
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
                {ing.type === "Prep recipe" && (
                  <Badge variant="outline" className="text-xs">
                    prep
                  </Badge>
                )}
              </span>
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
            <TableCell colSpan={3} />
          </TableRow>
        );
      })}
    </>
  );
}
