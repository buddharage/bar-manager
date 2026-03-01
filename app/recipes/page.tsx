"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ──────────────────────────────────────────────────────────

interface Ingredient {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  cost_per_unit: number | null;
}

interface PrepRecipeComponent {
  id: number;
  ingredient_id: number | null;
  prep_recipe_ref_id: number | null;
  quantity: number;
  unit: string | null;
  ingredients?: { name: string; unit: string } | null;
  prep_recipes?: { name: string } | null;
}

interface PrepRecipe {
  id: number;
  name: string;
  instructions: string | null;
  yield_amount: number | null;
  yield_unit: string | null;
  components: PrepRecipeComponent[];
}

interface RecipeComponent {
  id: number;
  ingredient_id: number | null;
  prep_recipe_id: number | null;
  quantity: number;
  unit: string | null;
  ingredients?: { name: string; unit: string } | null;
  prep_recipes?: { name: string } | null;
}

interface Recipe {
  id: number;
  name: string;
  menu_item_name: string | null;
  instructions: string | null;
  components: RecipeComponent[];
}

interface ComponentInput {
  type: "ingredient" | "prep_recipe";
  id: number;
  name: string;
  quantity: string;
  unit: string;
}

// ─── Autocomplete Component ─────────────────────────────────────────

function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 50);
    const lower = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower)).slice(0, 50);
  }, [search, options]);

  return (
    <div ref={ref} className="relative">
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(option);
                setSearch(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CSV Upload Button ──────────────────────────────────────────────

function CSVUpload({
  endpoint,
  onSuccess,
  label,
}: {
  endpoint: string;
  onSuccess: () => void;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Error: ${data.error}`);
      } else {
        setResult(`Added ${data.added}, skipped ${data.skipped} duplicates`);
        onSuccess();
      }
    } catch {
      setResult("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? "Uploading..." : label}
      </Button>
      {result && (
        <p className={`text-sm ${result.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
          {result}
        </p>
      )}
    </div>
  );
}

// ─── Component Selector ─────────────────────────────────────────────

function ComponentEditor({
  components,
  onChange,
  ingredients,
  prepRecipes,
}: {
  components: ComponentInput[];
  onChange: (components: ComponentInput[]) => void;
  ingredients: Ingredient[];
  prepRecipes: PrepRecipe[];
}) {
  const allOptions = useMemo(() => {
    const opts: { type: "ingredient" | "prep_recipe"; id: number; name: string; unit: string }[] = [];
    for (const i of ingredients) {
      opts.push({ type: "ingredient", id: i.id, name: i.name, unit: i.unit });
    }
    for (const p of prepRecipes) {
      opts.push({ type: "prep_recipe", id: p.id, name: `[Prep] ${p.name}`, unit: p.yield_unit || "oz" });
    }
    return opts;
  }, [ingredients, prepRecipes]);

  const addComponent = () => {
    onChange([...components, { type: "ingredient", id: 0, name: "", quantity: "", unit: "oz" }]);
  };

  const removeComponent = (idx: number) => {
    onChange(components.filter((_, i) => i !== idx));
  };

  const updateComponent = (idx: number, updates: Partial<ComponentInput>) => {
    const next = [...components];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <Label>Components</Label>
      {components.map((comp, idx) => (
        <div key={idx} className="flex gap-2 items-end">
          <div className="flex-1">
            <Autocomplete
              value={comp.name}
              onChange={(name) => {
                const match = allOptions.find((o) => o.name === name);
                if (match) {
                  updateComponent(idx, {
                    type: match.type,
                    id: match.id,
                    name: match.name,
                    unit: match.unit,
                  });
                } else {
                  updateComponent(idx, { name });
                }
              }}
              options={allOptions.map((o) => o.name)}
              placeholder="Search ingredient or prep recipe..."
            />
          </div>
          <div className="w-20">
            <Input
              type="number"
              step="any"
              placeholder="Qty"
              value={comp.quantity}
              onChange={(e) => updateComponent(idx, { quantity: e.target.value })}
            />
          </div>
          <div className="w-20">
            <Input
              placeholder="Unit"
              value={comp.unit}
              onChange={(e) => updateComponent(idx, { unit: e.target.value })}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => removeComponent(idx)}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addComponent}>
        + Add Component
      </Button>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function RecipesPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [prepRecipes, setPrepRecipes] = useState<PrepRecipe[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"ingredient" | "prep_recipe" | "recipe">("ingredient");

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formUnit, setFormUnit] = useState("oz");
  const [formCostPerUnit, setFormCostPerUnit] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formYieldAmount, setFormYieldAmount] = useState("");
  const [formYieldUnit, setFormYieldUnit] = useState("");
  const [formMenuItemName, setFormMenuItemName] = useState("");
  const [formComponents, setFormComponents] = useState<ComponentInput[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ingRes, prepRes, recRes, menuRes] = await Promise.all([
        fetch("/api/recipes/ingredients"),
        fetch("/api/recipes/prep-recipes"),
        fetch("/api/recipes"),
        fetch("/api/recipes/menu-items"),
      ]);

      if (ingRes.ok) {
        const data = await ingRes.json();
        setIngredients(data.ingredients || []);
      }
      if (prepRes.ok) {
        const data = await prepRes.json();
        setPrepRecipes(data.prepRecipes || []);
      }
      if (recRes.ok) {
        const data = await recRes.json();
        setRecipes(data.recipes || []);
      }
      if (menuRes.ok) {
        const data = await menuRes.json();
        setMenuItems(data.menuItems || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resetForm = () => {
    setFormName("");
    setFormCategory("");
    setFormUnit("oz");
    setFormCostPerUnit("");
    setFormInstructions("");
    setFormYieldAmount("");
    setFormYieldUnit("");
    setFormMenuItemName("");
    setFormComponents([]);
    setFormError(null);
  };

  const openDialog = (type: "ingredient" | "prep_recipe" | "recipe") => {
    resetForm();
    setDialogType(type);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      const validComponents = formComponents.filter((c) => c.id > 0 && c.quantity);

      switch (dialogType) {
        case "ingredient":
          endpoint = "/api/recipes/ingredients";
          body = {
            name: formName,
            category: formCategory || null,
            unit: formUnit,
            cost_per_unit: formCostPerUnit ? parseFloat(formCostPerUnit) : null,
          };
          break;
        case "prep_recipe":
          endpoint = "/api/recipes/prep-recipes";
          body = {
            name: formName,
            instructions: formInstructions || null,
            yield_amount: formYieldAmount ? parseFloat(formYieldAmount) : null,
            yield_unit: formYieldUnit || null,
            components: validComponents.map((c) => ({
              ingredient_id: c.type === "ingredient" ? c.id : null,
              prep_recipe_ref_id: c.type === "prep_recipe" ? c.id : null,
              quantity: parseFloat(c.quantity),
              unit: c.unit,
            })),
          };
          break;
        case "recipe":
          endpoint = "/api/recipes";
          body = {
            name: formName,
            menu_item_name: formMenuItemName || null,
            instructions: formInstructions || null,
            components: validComponents.map((c) => ({
              ingredient_id: c.type === "ingredient" ? c.id : null,
              prep_recipe_id: c.type === "prep_recipe" ? c.id : null,
              quantity: parseFloat(c.quantity),
              unit: c.unit,
            })),
          };
          break;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save");
        return;
      }

      setDialogOpen(false);
      fetchAll();
    } catch {
      setFormError("An error occurred");
    } finally {
      setFormSaving(false);
    }
  };

  const dialogTitles = {
    ingredient: "Add Ingredient",
    prep_recipe: "Add Prep Recipe",
    recipe: "Add Recipe",
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Recipes & Ingredients</h1>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">
            Recipes <Badge variant="secondary" className="ml-2">{recipes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="prep-recipes">
            Prep Recipes <Badge variant="secondary" className="ml-2">{prepRecipes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="ingredients">
            Ingredients <Badge variant="secondary" className="ml-2">{ingredients.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ─── Recipes Tab ────────────────────────────────────── */}
        <TabsContent value="recipes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recipes</CardTitle>
                <div className="flex gap-2">
                  <CSVUpload
                    endpoint="/api/recipes"
                    onSuccess={fetchAll}
                    label="Upload CSV"
                  />
                  <Button size="sm" onClick={() => openDialog("recipe")}>
                    Add Recipe
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Recipes correspond to menu items. CSV columns: name, menu_item_name, instructions
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Loading...</p>
              ) : recipes.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No recipes yet. Add one manually or upload a CSV.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Menu Item</TableHead>
                      <TableHead>Components</TableHead>
                      <TableHead>Instructions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipes.map((recipe) => (
                      <TableRow key={recipe.id}>
                        <TableCell className="font-medium">{recipe.name}</TableCell>
                        <TableCell>
                          {recipe.menu_item_name ? (
                            <Badge variant="outline">{recipe.menu_item_name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {recipe.components.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {recipe.components.map((c) => (
                                <Badge key={c.id} variant="secondary" className="text-xs">
                                  {c.quantity} {c.unit}{" "}
                                  {c.ingredients?.name || c.prep_recipes?.name || "Unknown"}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                          {recipe.instructions || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Prep Recipes Tab ───────────────────────────────── */}
        <TabsContent value="prep-recipes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Prep Recipes</CardTitle>
                <div className="flex gap-2">
                  <CSVUpload
                    endpoint="/api/recipes/prep-recipes"
                    onSuccess={fetchAll}
                    label="Upload CSV"
                  />
                  <Button size="sm" onClick={() => openDialog("prep_recipe")}>
                    Add Prep Recipe
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Syrups, batches, and sub-recipes. CSV columns: name, instructions, yield_amount, yield_unit
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Loading...</p>
              ) : prepRecipes.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No prep recipes yet. Add one manually or upload a CSV.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Yield</TableHead>
                      <TableHead>Components</TableHead>
                      <TableHead>Instructions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prepRecipes.map((pr) => (
                      <TableRow key={pr.id}>
                        <TableCell className="font-medium">{pr.name}</TableCell>
                        <TableCell>
                          {pr.yield_amount ? (
                            `${pr.yield_amount} ${pr.yield_unit || ""}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {pr.components.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {pr.components.map((c) => (
                                <Badge key={c.id} variant="secondary" className="text-xs">
                                  {c.quantity} {c.unit}{" "}
                                  {c.ingredients?.name || c.prep_recipes?.name || "Unknown"}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                          {pr.instructions || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Ingredients Tab ────────────────────────────────── */}
        <TabsContent value="ingredients">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ingredients</CardTitle>
                <div className="flex gap-2">
                  <CSVUpload
                    endpoint="/api/recipes/ingredients"
                    onSuccess={fetchAll}
                    label="Upload CSV"
                  />
                  <Button size="sm" onClick={() => openDialog("ingredient")}>
                    Add Ingredient
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                CSV columns: name, category, unit, cost_per_unit
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Loading...</p>
              ) : ingredients.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No ingredients yet. Add one manually or upload a CSV.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Cost/Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredients.map((ing) => (
                      <TableRow key={ing.id}>
                        <TableCell className="font-medium">{ing.name}</TableCell>
                        <TableCell>{ing.category || "—"}</TableCell>
                        <TableCell>{ing.unit}</TableCell>
                        <TableCell className="text-right">
                          {ing.cost_per_unit != null
                            ? `$${ing.cost_per_unit.toFixed(2)}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Add Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitles[dialogType]}</DialogTitle>
            <DialogDescription>
              {dialogType === "ingredient" && "Add a new ingredient used in recipes."}
              {dialogType === "prep_recipe" && "Add a prep recipe like a syrup, batch, or sub-recipe."}
              {dialogType === "recipe" && "Add a recipe and optionally map it to a menu item."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name - always shown */}
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={
                  dialogType === "ingredient"
                    ? "e.g. Fresh Lime Juice"
                    : dialogType === "prep_recipe"
                    ? "e.g. Verdito"
                    : "e.g. Shade of Jade"
                }
              />
            </div>

            {/* Ingredient-specific fields */}
            {dialogType === "ingredient" && (
              <>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Spirits, Citrus, Sweetener"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      placeholder="oz"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost">Cost per Unit</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={formCostPerUnit}
                      onChange={(e) => setFormCostPerUnit(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Prep recipe-specific fields */}
            {dialogType === "prep_recipe" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="yield_amount">Yield Amount</Label>
                    <Input
                      id="yield_amount"
                      type="number"
                      step="any"
                      value={formYieldAmount}
                      onChange={(e) => setFormYieldAmount(e.target.value)}
                      placeholder="e.g. 32"
                    />
                  </div>
                  <div>
                    <Label htmlFor="yield_unit">Yield Unit</Label>
                    <Input
                      id="yield_unit"
                      value={formYieldUnit}
                      onChange={(e) => setFormYieldUnit(e.target.value)}
                      placeholder="e.g. oz"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="instructions">Instructions</Label>
                  <textarea
                    id="instructions"
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    placeholder="Preparation steps..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <ComponentEditor
                  components={formComponents}
                  onChange={setFormComponents}
                  ingredients={ingredients}
                  prepRecipes={prepRecipes}
                />
              </>
            )}

            {/* Recipe-specific fields */}
            {dialogType === "recipe" && (
              <>
                <div>
                  <Label htmlFor="menu_item">Menu Item</Label>
                  <Autocomplete
                    value={formMenuItemName}
                    onChange={setFormMenuItemName}
                    options={menuItems}
                    placeholder="Search menu items..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Map this recipe to a menu item from your POS
                  </p>
                </div>
                <div>
                  <Label htmlFor="instructions">Instructions</Label>
                  <textarea
                    id="instructions"
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    placeholder="Preparation steps..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <ComponentEditor
                  components={formComponents}
                  onChange={setFormComponents}
                  ingredients={ingredients}
                  prepRecipes={prepRecipes}
                />
              </>
            )}

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={formSaving}>
              {formSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
