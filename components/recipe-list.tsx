"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn, stripHtml } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
import { Printer, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { RECIPE_GROUPS } from "@/lib/constants/recipe-groups";
import { abbreviateUom } from "@/lib/units";

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

interface CascadeInfo {
  onMenuBy: string[];
  creator: string | null;
  createdAtLabel: string | null;
}

// ---------------------------------------------------------------------------
// Mobile detection hook
// ---------------------------------------------------------------------------

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
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
// Helper: slugify group names for tab values
// ---------------------------------------------------------------------------

function groupSlug(group: string) {
  return group.replace(/\s+/g, "-").toLowerCase();
}

const PRIORITY_GROUPS: string[] = [
  RECIPE_GROUPS.HOUSE_COCKTAILS,
  RECIPE_GROUPS.COCKTAIL_BATCH,
  RECIPE_GROUPS.MOCKTAILS,
  RECIPE_GROUPS.COCKTAIL,
  RECIPE_GROUPS.BEER,
];

function sortGroups(groups: string[]): string[] {
  const priority = groups.filter((g) => PRIORITY_GROUPS.includes(g));
  const rest = groups.filter((g) => !PRIORITY_GROUPS.includes(g));
  priority.sort((a, b) => PRIORITY_GROUPS.indexOf(a) - PRIORITY_GROUPS.indexOf(b));
  rest.sort((a, b) => a.localeCompare(b));
  return [...priority, ...rest];
}

// ---------------------------------------------------------------------------
// Main RecipeList component
// ---------------------------------------------------------------------------

const BASE_COL_COUNT = 8; // total visible columns
const COST_COL_COUNT = 3; // Price, Cost, Cost % columns

export function RecipeList({
  recipes: initialRecipes,
  initialGroup,
}: {
  recipes: Recipe[];
  initialGroup?: string | null;
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [activeTab, setActiveTab] = useState<string>(initialGroup || "");
  const [scrollTargetId, setScrollTargetId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
  const [filterOnMenu, setFilterOnMenu] = useState<"" | "yes" | "no">("yes");
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

  // Lookup maps
  const guidToRecipe = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of recipes) map.set(r.xtrachef_guid, r);
    return map;
  }, [recipes]);

  const recipeById = useMemo(() => {
    const map = new Map<number, Recipe>();
    for (const r of recipes) map.set(r.id, r);
    return map;
  }, [recipes]);

  // Reverse lookup: prep recipe id -> list of recipes that use it as an ingredient
  const usedInMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; group: string }[]>();
    for (const r of recipes) {
      for (const ing of r.recipe_ingredients) {
        if (ing.type === "Prep recipe" && ing.reference_guid) {
          const prepRecipe = guidToRecipe.get(ing.reference_guid);
          if (prepRecipe) {
            const list = map.get(prepRecipe.id) || [];
            // Avoid duplicates
            if (!list.some((x) => x.id === r.id)) {
              list.push({ id: r.id, name: r.name, group: r.recipe_group || "Uncategorized" });
            }
            map.set(prepRecipe.id, list);
          }
        }
      }
    }
    return map;
  }, [recipes, guidToRecipe]);

  // Cascade values from parent recipes to their prep recipe / syrup ingredients.
  // on_menu cascades from any on_menu parent. creator & created_at_label cascade
  // from any parent that has those fields set.
  const cascadeMap = useMemo(() => {
    // Parse "YYYY Season" labels into a sortable number so we can pick the earliest
    const SEASON_ORDER: Record<string, number> = { Original: 0, Winter: 1, Spring: 2, Summer: 3, Fall: 4 };
    function labelRank(label: string): number {
      const parts = label.split(" ");
      const year = parseInt(parts[0], 10) || 0;
      const season = SEASON_ORDER[parts[1]] ?? 0;
      return year * 10 + season;
    }

    const map = new Map<number, CascadeInfo>();

    function getOrCreate(id: number): CascadeInfo {
      let info = map.get(id);
      if (!info) {
        info = { onMenuBy: [], creator: null, createdAtLabel: null };
        map.set(id, info);
      }
      return info;
    }

    // Track the earliest created_at_label rank for the creator separately,
    // so we pick the earliest parent that actually HAS a creator value.
    const creatorRank = new Map<number, number>();

    for (const r of recipes) {
      for (const ing of r.recipe_ingredients) {
        if (ing.type !== "Prep recipe" || !ing.reference_guid) continue;
        const prepRecipe = guidToRecipe.get(ing.reference_guid);
        if (!prepRecipe) continue;

        const info = getOrCreate(prepRecipe.id);
        if (r.on_menu && !info.onMenuBy.includes(r.name)) {
          info.onMenuBy.push(r.name);
        }
        // Pick the earliest created_at_label across all parents
        if (r.created_at_label) {
          if (!info.createdAtLabel || labelRank(r.created_at_label) < labelRank(info.createdAtLabel)) {
            info.createdAtLabel = r.created_at_label;
          }
        }
        // Pick creator from the earliest parent that has one
        if (r.creator) {
          const rank = r.created_at_label ? labelRank(r.created_at_label) : Infinity;
          const prevRank = creatorRank.get(prepRecipe.id) ?? Infinity;
          if (!info.creator || rank < prevRank) {
            info.creator = r.creator;
            creatorRank.set(prepRecipe.id, rank);
          }
        }
      }
    }

    // Remove entries that have nothing to cascade
    for (const [id, info] of map) {
      if (info.onMenuBy.length === 0 && !info.creator && !info.createdAtLabel) {
        map.delete(id);
      }
    }

    return map;
  }, [recipes, guidToRecipe]);

  // Convenience accessors
  const cascadedOnMenuBy = useCallback(
    (id: number) => {
      const info = cascadeMap.get(id);
      return info && info.onMenuBy.length > 0 ? info.onMenuBy : undefined;
    },
    [cascadeMap],
  );

  // Effective on_menu: true if manually set OR cascaded from a parent
  const isEffectivelyOnMenu = useCallback(
    (recipe: Recipe) => recipe.on_menu || !!cascadedOnMenuBy(recipe.id),
    [cascadedOnMenuBy],
  );

  // Filter + search
  const filtered = useMemo(() => {
    let list = recipes;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filterOnMenu === "yes") list = list.filter((r) => isEffectivelyOnMenu(r));
    if (filterOnMenu === "no") list = list.filter((r) => !isEffectivelyOnMenu(r));
    if (filterCreator) list = list.filter((r) => (cascadeMap.get(r.id)?.creator ?? r.creator) === filterCreator);
    if (filterCreatedAt) list = list.filter((r) => (cascadeMap.get(r.id)?.createdAtLabel ?? r.created_at_label) === filterCreatedAt);

    return list;
  }, [recipes, search, filterOnMenu, isEffectivelyOnMenu, cascadeMap, filterCreator, filterCreatedAt]);

  const groups = useMemo(
    () => sortGroups([...new Set(filtered.map((r) => r.recipe_group || "Uncategorized"))]),
    [filtered],
  );

  // Set initial active tab (fallback when no slug in URL or slug doesn't match)
  useEffect(() => {
    if (groups.length > 0 && (!activeTab || !groups.some((g) => groupSlug(g) === activeTab))) {
      setActiveTab(groupSlug(groups[0]));
    }
  }, [groups, activeTab]);

  // Sync URL when active tab changes
  useEffect(() => {
    if (!activeTab) return;
    const path = activeTab ? `/recipes/${activeTab}` : "/recipes";
    if (window.location.pathname !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [activeTab]);

  // Scroll to target recipe after tab switch + render
  useEffect(() => {
    if (scrollTargetId == null) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`recipe-${scrollTargetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(scrollTargetId);
        // Clear highlight after animation
        setTimeout(() => setHighlightId(null), 2000);
      }
      setScrollTargetId(null);
    }, 50); // short delay to let the tab content render
    return () => clearTimeout(timer);
  }, [scrollTargetId, activeTab]);

  // Sort within groups
  function effectiveValue(recipe: Recipe, key: SortKey): unknown {
    if (key === "on_menu") return recipe.on_menu || !!cascadedOnMenuBy(recipe.id);
    if (key === "creator") return cascadeMap.get(recipe.id)?.creator ?? recipe.creator;
    if (key === "created_at_label") return cascadeMap.get(recipe.id)?.createdAtLabel ?? recipe.created_at_label;
    return recipe[key];
  }

  function sortRecipes(list: Recipe[]): Recipe[] {
    if (!sort) return list;
    return [...list].sort((a, b) =>
      compare(effectiveValue(a, sort.key), effectiveValue(b, sort.key), sort.dir),
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

  // Navigate to a recipe: switch tab, expand it, scroll to it
  const navigateToRecipe = useCallback(
    (recipeId: number) => {
      const target = recipeById.get(recipeId);
      if (!target) return;

      const targetGroup = target.recipe_group || "Uncategorized";
      const targetSlug = groupSlug(targetGroup);

      // Switch tab
      setActiveTab(targetSlug);
      // Expand the target recipe
      setExpandedIds((prev) => new Set(prev).add(recipeId));
      // Queue scroll
      setScrollTargetId(recipeId);
    },
    [recipeById],
  );

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

  // Build print URL with the active category's recipe IDs
  const printUrl = useMemo(() => {
    const group = groups.find((g) => groupSlug(g) === activeTab);
    if (!group) return "/recipes/print";
    const categoryRecipes = filtered.filter(
      (r) => (r.recipe_group || "Uncategorized") === group,
    );
    const ids = categoryRecipes.map((r) => r.id).join(",");
    return `/recipes/print?ids=${ids}&category=${encodeURIComponent(group)}`;
  }, [filtered, groups, activeTab]);

  // Active group's recipes (used for mobile rendering)
  const activeGroupRecipes = useMemo(() => {
    const group = groups.find((g) => groupSlug(g) === activeTab);
    if (!group) return [];
    return sortRecipes(
      filtered.filter((r) => (r.recipe_group || "Uncategorized") === group),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, activeTab, filtered, sort]);

  // Are all expandable rows in the active group expanded?
  const expandableGroupIds = useMemo(
    () => activeGroupRecipes.filter((r) => r.recipe_ingredients?.length > 0).map((r) => r.id),
    [activeGroupRecipes],
  );
  const allExpanded = expandableGroupIds.length > 0 && expandableGroupIds.every((id) => expandedIds.has(id));

  const activeGroupName = groups.find((g) => groupSlug(g) === activeTab) || "";
  const hideCosts = activeGroupName === RECIPE_GROUPS.COCKTAIL_BATCH || activeGroupName === RECIPE_GROUPS.SYRUPS;

  function toggleExpandAll() {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (allExpanded) {
        for (const id of expandableGroupIds) next.delete(id);
      } else {
        for (const id of expandableGroupIds) next.add(id);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Filter controls (shared between mobile & desktop)
  // -------------------------------------------------------------------------

  const filterControls = (
    <div className="flex flex-wrap items-end gap-3">
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

      <a
        href={printUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </a>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search + filters — sticky header */}
      <div className="sticky top-0 z-10 bg-background pb-3 space-y-3 border-b">
        {isMobile ? (
          <>
            {/* Mobile: search + filter toggle + category dropdown */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                Filters{hasActiveFilters ? " *" : ""}
              </Button>
            </div>

            {filtersOpen && filterControls}

            {/* Mobile category dropdown */}
            {groups.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                >
                  {groups.map((group) => {
                    const count = filtered.filter(
                      (r) => (r.recipe_group || "Uncategorized") === group,
                    ).length;
                    return (
                      <option key={group} value={groupSlug(group)}>
                        {group} ({count})
                      </option>
                    );
                  })}
                </select>
                {expandableGroupIds.length > 0 && (
                  <Button variant="outline" size="icon" className="shrink-0 h-10 w-10" onClick={toggleExpandAll} title={allExpanded ? "Collapse All" : "Expand All"}>
                    {allExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Desktop: search + inline filters */}
            <div className="flex flex-wrap items-end gap-3">
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              {filterControls}
            </div>
          </>
        )}
      </div>

      {filtered.length === 0 && (search.trim() || hasActiveFilters) && (
        <p className="text-sm text-muted-foreground py-4">
          No recipes matching current filters.
        </p>
      )}

      {/* Mobile: card list for active category */}
      {isMobile && groups.length > 0 && (
        <div className="space-y-2">
          {activeGroupRecipes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No recipes in this category.
            </p>
          ) : (
            activeGroupRecipes.map((recipe) => (
              <MobileRecipeCard
                key={recipe.id}
                recipe={recipe}
                isExpanded={expandedIds.has(recipe.id)}
                isHighlighted={highlightId === recipe.id}
                onToggle={() => toggleExpanded(recipe.id)}
                guidToRecipe={guidToRecipe}
                usedIn={usedInMap.get(recipe.id)}
                cascade={cascadeMap.get(recipe.id)}
                onNavigate={navigateToRecipe}
                creatorOptions={creatorOptions}
                createdAtOptions={createdAtOptions}
                onUpdate={updateRecipe}
              />
            ))
          )}
        </div>
      )}

      {/* Desktop: category dropdown + sortable table */}
      {!isMobile && groups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
            >
              {groups.map((group) => {
                const count = filtered.filter(
                  (r) => (r.recipe_group || "Uncategorized") === group,
                ).length;
                return (
                  <option key={group} value={groupSlug(group)}>
                    {group} ({count})
                  </option>
                );
              })}
            </select>
            {expandableGroupIds.length > 0 && (
              <Button variant="outline" size="sm" onClick={toggleExpandAll}>
                {allExpanded ? (
                  <><ChevronsDownUp className="h-3.5 w-3.5 mr-1.5" />Collapse All</>
                ) : (
                  <><ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />Expand All</>
                )}
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Name" sortKey="name" currentSort={sort} onSort={handleSort} />
                    {!hideCosts && <SortableHead label="Price" sortKey="menu_price" currentSort={sort} onSort={handleSort} className="text-right" />}
                    {!hideCosts && <SortableHead label="Cost" sortKey="prime_cost" currentSort={sort} onSort={handleSort} className="text-right" />}
                    {!hideCosts && <SortableHead label="Cost %" sortKey="food_cost_pct" currentSort={sort} onSort={handleSort} className="text-right" />}
                    <SortableHead label="On Menu" sortKey="on_menu" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Refrigerate" sortKey="refrigerate" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Creator" sortKey="creator" currentSort={sort} onSort={handleSort} />
                    <SortableHead label="Created At" sortKey="created_at_label" currentSort={sort} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeGroupRecipes.map((recipe) => {
                    const hasIngredients = recipe.recipe_ingredients?.length > 0;
                    const isExpanded = expandedIds.has(recipe.id);

                    return (
                      <ExpandableRecipeRow
                        key={recipe.id}
                        recipe={recipe}
                        hasIngredients={hasIngredients}
                        isExpanded={isExpanded}
                        isHighlighted={highlightId === recipe.id}
                        onToggle={() => toggleExpanded(recipe.id)}
                        guidToRecipe={guidToRecipe}
                        usedIn={usedInMap.get(recipe.id)}
                        cascade={cascadeMap.get(recipe.id)}
                        onNavigate={navigateToRecipe}
                        creatorOptions={creatorOptions}
                        createdAtOptions={createdAtOptions}
                        onUpdate={updateRecipe}
                        hideCosts={hideCosts}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile recipe card (expandable)
// ---------------------------------------------------------------------------

function MobileRecipeCard({
  recipe,
  isExpanded,
  isHighlighted,
  onToggle,
  guidToRecipe,
  usedIn,
  cascade,
  onNavigate,
  creatorOptions,
  createdAtOptions,
  onUpdate,
}: {
  recipe: Recipe;
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  guidToRecipe: Map<string, Recipe>;
  usedIn?: { id: number; name: string; group: string }[];
  cascade?: CascadeInfo;
  onNavigate: (recipeId: number) => void;
  creatorOptions: string[];
  createdAtOptions: string[];
  onUpdate: (id: number, field: string, value: unknown) => void;
}) {
  const hasIngredients = recipe.recipe_ingredients?.length > 0;
  const cascadedBy = cascade && cascade.onMenuBy.length > 0 ? cascade.onMenuBy : undefined;
  const creatorIsCascaded = !!cascade?.creator;
  const createdAtIsCascaded = !!cascade?.createdAtLabel;
  const effectiveCreator = creatorIsCascaded ? cascade.creator : recipe.creator;
  const effectiveCreatedAt = createdAtIsCascaded ? cascade.createdAtLabel : recipe.created_at_label;

  return (
    <div
      id={`recipe-${recipe.id}`}
      className={cn(
        "border rounded-lg p-3 transition-colors",
        hasIngredients && "cursor-pointer active:bg-muted/50",
        isHighlighted && "bg-blue-100 dark:bg-blue-900/30 transition-colors duration-1000",
      )}
      onClick={hasIngredients ? onToggle : undefined}
    >
      {/* Card header */}
      <div className="flex items-start gap-2">
        {hasIngredients && (
          <span className="text-muted-foreground text-xs mt-0.5 w-4 shrink-0">
            {isExpanded ? "▼" : "▶"}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{recipe.name}</div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
            {recipe.menu_price != null && (
              <span>${Number(recipe.menu_price).toFixed(2)}</span>
            )}
            {recipe.prime_cost != null && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span>Cost ${Number(recipe.prime_cost).toFixed(2)}</span>
              </>
            )}
            {recipe.food_cost_pct != null && (
              <>
                <span className="text-muted-foreground/50">·</span>
                {costBadge(recipe.food_cost_pct)}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Badge
            variant={recipe.on_menu || cascadedBy ? "default" : "outline"}
            className={cn(
              "text-[10px] px-1.5",
              cascadedBy ? "cursor-not-allowed opacity-80" : "cursor-pointer",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!cascadedBy) onUpdate(recipe.id, "on_menu", !recipe.on_menu);
            }}
            title={cascadedBy ? `On menu via: ${cascadedBy.join(", ")}` : undefined}
          >
            {cascadedBy ? "Via" : recipe.on_menu ? "Menu" : "Off"}
          </Badge>
          <Badge
            variant={recipe.refrigerate ? "default" : "outline"}
            className="text-[10px] px-1.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(recipe.id, "refrigerate", !recipe.refrigerate);
            }}
          >
            {recipe.refrigerate ? "Fridge" : "No"}
          </Badge>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Image */}
          {recipe.image_url && (
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="w-full h-36 object-cover rounded"
            />
          )}

          {/* Meta fields */}
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {recipe.serving_size != null && (
                <span className="text-muted-foreground">
                  Serving: {Number(recipe.serving_size)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">Creator:</span>
                {creatorIsCascaded ? (
                  <span className="text-sm italic text-muted-foreground" title="Inherited from parent recipe">
                    {effectiveCreator}
                  </span>
                ) : (
                  <EditableCell
                    value={recipe.creator}
                    options={creatorOptions}
                    onSave={(val) => onUpdate(recipe.id, "creator", val)}
                    placeholder="Add..."
                  />
                )}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">Created:</span>
                {createdAtIsCascaded ? (
                  <span className="text-sm italic text-muted-foreground" title="Inherited from parent recipe">
                    {effectiveCreatedAt}
                  </span>
                ) : (
                  <EditableCell
                    value={recipe.created_at_label}
                    options={createdAtOptions}
                    onSave={(val) => onUpdate(recipe.id, "created_at_label", val)}
                    placeholder="Add..."
                  />
                )}
              </span>
            </div>

            {recipe.notes && (
              <p className="text-xs">
                <span className="font-medium text-muted-foreground">Notes:</span>{" "}
                {recipe.notes}
              </p>
            )}
            {recipe.instructions && (
              <div className="text-xs">
                <span className="font-medium text-muted-foreground">Instructions:</span>
                <br />
                <span className="whitespace-pre-line">{stripHtml(recipe.instructions)}</span>
              </div>
            )}

            {/* Used in links */}
            {usedIn && usedIn.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-medium text-muted-foreground">Used in:</span>
                {usedIn.map((ref, i) => (
                  <span key={ref.id}>
                    <button
                      type="button"
                      className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
                      onClick={() => onNavigate(ref.id)}
                    >
                      {ref.name}
                    </button>
                    {i < usedIn.length - 1 && <span className="text-muted-foreground">,</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ingredients list */}
          {recipe.recipe_ingredients.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ingredients
              </div>
              {recipe.recipe_ingredients.map((ing) => {
                const linkedRecipe =
                  ing.type === "Prep recipe" && ing.reference_guid
                    ? guidToRecipe.get(ing.reference_guid)
                    : undefined;

                return (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {linkedRecipe ? (
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 text-left"
                          onClick={() => onNavigate(linkedRecipe.id)}
                        >
                          {ing.name}
                        </button>
                      ) : (
                        <span className="truncate">{ing.name}</span>
                      )}
                      {ing.type === "Prep recipe" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                          prep
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 ml-2 text-right">
                      {ing.quantity != null ? ing.quantity : ""}{" "}
                      {abbreviateUom(ing.uom)}
                      {ing.cost != null && (
                        <span className="ml-1">${Number(ing.cost).toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop expandable recipe row
// ---------------------------------------------------------------------------

function ExpandableRecipeRow({
  recipe,
  hasIngredients,
  isExpanded,
  isHighlighted,
  onToggle,
  guidToRecipe,
  usedIn,
  cascade,
  onNavigate,
  creatorOptions,
  createdAtOptions,
  onUpdate,
  hideCosts,
}: {
  recipe: Recipe;
  hasIngredients: boolean;
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  guidToRecipe: Map<string, Recipe>;
  usedIn?: { id: number; name: string; group: string }[];
  cascade?: CascadeInfo;
  onNavigate: (recipeId: number) => void;
  creatorOptions: string[];
  createdAtOptions: string[];
  onUpdate: (id: number, field: string, value: unknown) => void;
  hideCosts?: boolean;
}) {
  const cascadedBy = cascade && cascade.onMenuBy.length > 0 ? cascade.onMenuBy : undefined;
  const creatorIsCascaded = !!cascade?.creator;
  const createdAtIsCascaded = !!cascade?.createdAtLabel;
  const effectiveCreator = creatorIsCascaded ? cascade.creator : recipe.creator;
  const effectiveCreatedAt = createdAtIsCascaded ? cascade.createdAtLabel : recipe.created_at_label;

  return (
    <>
      <TableRow
        id={`recipe-${recipe.id}`}
        className={`${hasIngredients ? "cursor-pointer hover:bg-muted/50" : ""} ${
          isHighlighted ? "bg-blue-100 dark:bg-blue-900/30 transition-colors duration-1000" : ""
        }`}
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
        {!hideCosts && (
          <TableCell className="text-right">
            {recipe.menu_price != null
              ? `$${Number(recipe.menu_price).toFixed(2)}`
              : "—"}
          </TableCell>
        )}
        {!hideCosts && (
          <TableCell className="text-right">
            {recipe.prime_cost != null
              ? `$${Number(recipe.prime_cost).toFixed(2)}`
              : "—"}
          </TableCell>
        )}
        {!hideCosts && (
          <TableCell className="text-right">
            {costBadge(recipe.food_cost_pct)}
          </TableCell>
        )}

        {/* On Menu — click to toggle (disabled if cascaded from parent) */}
        <TableCell>
          <Badge
            variant={recipe.on_menu || cascadedBy ? "default" : "outline"}
            className={cascadedBy ? "cursor-not-allowed opacity-80" : "cursor-pointer"}
            onClick={(e) => {
              e.stopPropagation();
              if (!cascadedBy) onUpdate(recipe.id, "on_menu", !recipe.on_menu);
            }}
            title={cascadedBy ? `On menu via: ${cascadedBy.join(", ")}` : undefined}
          >
            {cascadedBy ? `Via ${cascadedBy.length > 1 ? `${cascadedBy.length} recipes` : cascadedBy[0]}` : recipe.on_menu ? "Yes" : "No"}
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

        {/* Creator — editable, or inherited from parent */}
        <TableCell>
          {creatorIsCascaded ? (
            <span className="text-sm italic text-muted-foreground" title="Inherited from parent recipe">
              {effectiveCreator}
            </span>
          ) : (
            <EditableCell
              value={recipe.creator}
              options={creatorOptions}
              onSave={(val) => onUpdate(recipe.id, "creator", val)}
              placeholder="Add..."
            />
          )}
        </TableCell>

        {/* Created At — editable, or inherited from parent */}
        <TableCell>
          {createdAtIsCascaded ? (
            <span className="text-sm italic text-muted-foreground" title="Inherited from parent recipe">
              {effectiveCreatedAt}
            </span>
          ) : (
            <EditableCell
              value={recipe.created_at_label}
              options={createdAtOptions}
              onSave={(val) => onUpdate(recipe.id, "created_at_label", val)}
              placeholder="Add..."
            />
          )}
        </TableCell>
      </TableRow>

      {isExpanded && (recipe.notes || recipe.serving_size != null || recipe.instructions || recipe.image_url || (usedIn && usedIn.length > 0)) && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={hideCosts ? BASE_COL_COUNT - COST_COL_COUNT : BASE_COL_COUNT} className="py-3 px-10">
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
                    <span className="font-medium text-muted-foreground">Instructions:</span>
                    <br />
                    <span className="whitespace-pre-line">{stripHtml(recipe.instructions)}</span>
                  </div>
                )}
                {usedIn && usedIn.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-muted-foreground">Used in:</span>
                    {usedIn.map((ref, i) => (
                      <span key={ref.id}>
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(ref.id);
                          }}
                        >
                          {ref.name}
                        </button>
                        {i < usedIn.length - 1 && <span className="text-muted-foreground">,</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {isExpanded && recipe.recipe_ingredients.map((ing) => {
        const linkedRecipe =
          ing.type === "Prep recipe" && ing.reference_guid
            ? guidToRecipe.get(ing.reference_guid)
            : undefined;

        return (
          <TableRow key={ing.id} className="bg-muted/30">
            <TableCell className="pl-10 text-sm">
              <span className="flex items-center gap-1.5">
                {linkedRecipe ? (
                  <button
                    type="button"
                    className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(linkedRecipe.id);
                    }}
                  >
                    {ing.name}
                  </button>
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
              {abbreviateUom(ing.uom) || "—"}
            </TableCell>
            <TableCell className="text-sm text-right">
              {ing.cost != null ? `$${Number(ing.cost).toFixed(4)}` : "—"}
            </TableCell>
            <TableCell colSpan={hideCosts ? 0 : 3} />
          </TableRow>
        );
      })}
    </>
  );
}
