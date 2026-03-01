"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Ingredient } from "@/lib/supabase/types";
import { baseToPurchase, COMMON_UNITS, COMMON_PURCHASE_UNITS } from "@/lib/units";

type IngredientWithAlerts = Ingredient & { active_alerts: number };

interface Summary {
  total: number;
  counted: number;
  belowPar: number;
  categories: number;
}

// SVG icon components for reuse
const SettingsIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

const HistoryIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

// Expected inventory icon (box/package icon) for mobile column header
const ExpectedIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
);

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function CountDialog({
  ingredient,
  open,
  onOpenChange,
  onSaved,
}: {
  ingredient: IngredientWithAlerts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInput("");
      setNote("");
      setError(null);
    }
  }, [open]);

  async function handleSave() {
    if (!ingredient || !input.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/${ingredient.id}/count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity_raw: input.trim(), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save count");
      } else {
        onSaved();
        onOpenChange(false);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  if (!ingredient) return null;

  const hasConversion = ingredient.purchase_unit && ingredient.purchase_unit_quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Count: {ingredient.name}</DialogTitle>
          <DialogDescription>
            Enter the current quantity on hand.
            {hasConversion && (
              <>
                {" "}You can enter in {ingredient.purchase_unit}s (1 {ingredient.purchase_unit} = {ingredient.purchase_unit_quantity} {ingredient.unit}).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="count-input">Quantity</Label>
            <Input
              id="count-input"
              inputMode="decimal"
              placeholder={
                hasConversion
                  ? `e.g. "2 ${ingredient.purchase_unit}s" or "500 ${ingredient.unit}"`
                  : `e.g. "10" (in ${ingredient.unit || "units"})`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="count-note">Note (optional)</Label>
            <Input
              id="count-note"
              placeholder="e.g. After delivery, Weekly count"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {ingredient.last_counted_at && (
            <p className="text-xs text-muted-foreground">
              Last counted: {new Date(ingredient.last_counted_at).toLocaleString()}
              {" "}({formatQty(ingredient.last_counted_quantity, ingredient)})
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !input.trim()}>
            {saving ? "Saving..." : "Save Count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  ingredient,
  open,
  onOpenChange,
  onSaved,
}: {
  ingredient: IngredientWithAlerts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [parLevel, setParLevel] = useState("");
  const [unit, setUnit] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [purchaseUnitQty, setPurchaseUnitQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ingredient) {
      setParLevel(ingredient.par_level?.toString() || "");
      setUnit(ingredient.unit || "");
      setPurchaseUnit(ingredient.purchase_unit || "");
      setPurchaseUnitQty(ingredient.purchase_unit_quantity?.toString() || "");
      setError(null);
    }
  }, [open, ingredient]);

  async function handleSave() {
    if (!ingredient) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/${ingredient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          par_level: parLevel || null,
          unit: unit || null,
          purchase_unit: purchaseUnit || null,
          purchase_unit_quantity: purchaseUnitQty || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        onSaved();
        onOpenChange(false);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings: {ingredient.name}</DialogTitle>
          <DialogDescription>
            Configure par level, base unit, and purchase unit conversion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base-unit">Base Unit</Label>
              <select
                id="base-unit"
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                <option value="">Select...</option>
                {COMMON_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="par-level">Par Level ({unit || "units"})</Label>
              <Input
                id="par-level"
                type="number"
                step="any"
                placeholder="e.g. 500"
                value={parLevel}
                onChange={(e) => setParLevel(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Purchase Unit Conversion</p>
            <p className="text-xs text-muted-foreground mb-3">
              Define how the unit you buy converts to the base unit.
              For example: 1 bottle = 750 ml.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="purchase-unit">Purchase Unit</Label>
                <select
                  id="purchase-unit"
                  className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                >
                  <option value="">None</option>
                  {COMMON_PURCHASE_UNITS.map((pu) => (
                    <option key={pu} value={pu}>
                      {pu}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="purchase-qty">
                  1 {purchaseUnit || "unit"} = ? {unit || "base units"}
                </Label>
                <Input
                  id="purchase-qty"
                  type="number"
                  step="any"
                  placeholder="e.g. 750"
                  value={purchaseUnitQty}
                  onChange={(e) => setPurchaseUnitQty(e.target.value)}
                  disabled={!purchaseUnit}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  ingredient,
  open,
  onOpenChange,
}: {
  ingredient: IngredientWithAlerts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [counts, setCounts] = useState<
    { id: number; quantity: number; quantity_raw: string | null; note: string | null; counted_at: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && ingredient) {
      setLoading(true);
      fetch(`/api/inventory/${ingredient.id}/count`)
        .then((r) => r.json())
        .then((data) => setCounts(data.counts || []))
        .finally(() => setLoading(false));
    }
  }, [open, ingredient]);

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Count History: {ingredient.name}</DialogTitle>
          <DialogDescription>
            All manual inventory counts for this ingredient.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading...</p>
        ) : counts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No counts recorded yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entered</TableHead>
                  <TableHead className="text-right">Qty ({ingredient.unit})</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">
                      {new Date(c.counted_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.quantity_raw || "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.note || "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mobile ingredient detail dialog
// ---------------------------------------------------------------------------

function IngredientDetailDialog({
  ingredient,
  open,
  onOpenChange,
  onOpenSettings,
  onOpenHistory,
}: {
  ingredient: IngredientWithAlerts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: (item: IngredientWithAlerts) => void;
  onOpenHistory: (item: IngredientWithAlerts) => void;
}) {
  if (!ingredient) return null;

  const status = statusForIngredient(ingredient);
  const isBelowPar =
    ingredient.par_level != null &&
    ingredient.expected_quantity != null &&
    ingredient.expected_quantity <= ingredient.par_level;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ingredient.name}</DialogTitle>
          <DialogDescription>
            {ingredient.category || "Uncategorized"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Expected Inventory</p>
              <p className={`text-sm font-medium ${isBelowPar ? "text-destructive" : ""}`}>
                {ingredient.expected_quantity != null ? (
                  <>
                    {ingredient.expected_quantity} {ingredient.unit || ""}
                    {ingredient.purchase_unit && ingredient.purchase_unit_quantity ? (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round(baseToPurchase(ingredient.expected_quantity, ingredient.purchase_unit_quantity) * 100) / 100} {ingredient.purchase_unit}s)
                      </span>
                    ) : null}
                  </>
                ) : (
                  "\u2014"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Par Level</p>
              <p className="text-sm font-medium">
                {ingredient.par_level != null
                  ? `${ingredient.par_level} ${ingredient.unit || ""}`
                  : "\u2014"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Last Count</p>
              <p className="text-sm">
                {ingredient.last_counted_at ? (
                  <>
                    {ingredient.current_quantity} {ingredient.unit || ""}
                    {ingredient.purchase_unit && ingredient.purchase_unit_quantity ? (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round(baseToPurchase(ingredient.current_quantity, ingredient.purchase_unit_quantity) * 100) / 100} {ingredient.purchase_unit}s)
                      </span>
                    ) : null}
                  </>
                ) : (
                  "\u2014"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Counted At</p>
            <p className="text-sm">
              {ingredient.last_counted_at
                ? new Date(ingredient.last_counted_at).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              onOpenSettings(ingredient);
            }}
          >
            <SettingsIcon size={14} />
            <span className="ml-1.5">Conversion Settings</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              onOpenHistory(ingredient);
            }}
          >
            <HistoryIcon size={14} />
            <span className="ml-1.5">Count History</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatQty(qty: number, ing: Ingredient): string {
  if (ing.purchase_unit && ing.purchase_unit_quantity && ing.purchase_unit_quantity > 0) {
    const inPurchase = baseToPurchase(qty, ing.purchase_unit_quantity);
    const rounded = Math.round(inPurchase * 100) / 100;
    return `${rounded} ${ing.purchase_unit}${rounded !== 1 ? "s" : ""} (${qty} ${ing.unit || "units"})`;
  }
  return `${qty} ${ing.unit || "units"}`;
}

function statusForIngredient(ing: IngredientWithAlerts): {
  label: string;
  variant: "destructive" | "default" | "secondary";
} {
  if (ing.expected_quantity != null && ing.expected_quantity === 0) {
    return { label: "Depleted", variant: "destructive" };
  }
  if (
    ing.par_level != null &&
    ing.expected_quantity != null &&
    ing.expected_quantity <= ing.par_level
  ) {
    return { label: "Below Par", variant: "destructive" };
  }
  if (!ing.last_counted_at) {
    return { label: "Not Counted", variant: "secondary" };
  }
  return { label: "OK", variant: "secondary" };
}

// ---------------------------------------------------------------------------
// Sort header (consistent with recipe table style)
// ---------------------------------------------------------------------------

type SortField = "name" | "expected_quantity" | "par_level" | "status";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
  children,
}: {
  label?: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const active = currentField === field;
  const arrow = active ? (currentDir === "asc" ? " \u25B2" : " \u25BC") : "";

  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className || ""}`}
      onClick={() => onSort(field)}
    >
      {children || label}
      {arrow && <span className="text-xs ml-0.5">{arrow}</span>}
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const COL_COUNT = 8; // total visible columns on desktop

export default function InventoryPage() {
  const [items, setItems] = useState<IngredientWithAlerts[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Dialog state
  const [countDialogItem, setCountDialogItem] = useState<IngredientWithAlerts | null>(null);
  const [settingsDialogItem, setSettingsDialogItem] = useState<IngredientWithAlerts | null>(null);
  const [historyDialogItem, setHistoryDialogItem] = useState<IngredientWithAlerts | null>(null);
  const [detailDialogItem, setDetailDialogItem] = useState<IngredientWithAlerts | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      if (!res.ok) throw new Error("Failed to load inventory");
      const data = await res.json();
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading inventory");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      await fetch("/api/inventory", { method: "POST" });
      await fetchInventory();
    } catch {
      // ignore
    }
    setRecalculating(false);
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "expected_quantity":
          cmp = (a.expected_quantity ?? -1) - (b.expected_quantity ?? -1);
          break;
        case "par_level":
          cmp = (a.par_level ?? -1) - (b.par_level ?? -1);
          break;
        case "status": {
          const sa = statusForIngredient(a);
          const sb = statusForIngredient(b);
          const order = { Depleted: 0, "Below Par": 1, "Not Counted": 2, OK: 3 };
          cmp = (order[sa.label as keyof typeof order] ?? 4) - (order[sb.label as keyof typeof order] ?? 4);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const groups = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, IngredientWithAlerts[]>();
    for (const item of sorted) {
      const key = item.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sorted, groupByCategory]);

  function renderRow(item: IngredientWithAlerts) {
    const status = statusForIngredient(item);
    const isBelowPar =
      item.par_level != null &&
      item.expected_quantity != null &&
      item.expected_quantity <= item.par_level;

    return (
      <TableRow
        key={item.id}
        className={isBelowPar ? "bg-destructive/5" : undefined}
      >
        {/* Name — tappable on mobile to open detail modal */}
        <TableCell className="font-medium">
          <span
            className="md:cursor-default cursor-pointer md:no-underline underline underline-offset-2"
            onClick={() => setDetailDialogItem(item)}
          >
            {item.name}
          </span>
        </TableCell>

        {/* Expected Inventory (2nd column) — tappable on mobile to open count dialog */}
        <TableCell
          className={`text-right font-medium ${isBelowPar ? "text-destructive" : ""}`}
        >
          <span
            className="md:cursor-default cursor-pointer md:no-underline underline underline-offset-2"
            onClick={() => setCountDialogItem(item)}
          >
            {item.expected_quantity != null ? (
              <>
                {item.expected_quantity} <span className="hidden md:inline">{item.unit || ""}</span>
                {item.purchase_unit && item.purchase_unit_quantity ? (
                  <span className="hidden md:inline text-xs text-muted-foreground ml-1">
                    ({Math.round(baseToPurchase(item.expected_quantity, item.purchase_unit_quantity) * 100) / 100} {item.purchase_unit}s)
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">{"\u2014"}</span>
            )}
          </span>
        </TableCell>

        {/* Category — hidden on mobile */}
        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
          {item.category || "\u2014"}
        </TableCell>

        {/* Last Count — hidden on mobile */}
        <TableCell className="hidden md:table-cell text-right">
          {item.last_counted_at ? (
            <span title={`Counted: ${new Date(item.last_counted_at).toLocaleString()}`}>
              {item.current_quantity} {item.unit || ""}
              {item.purchase_unit && item.purchase_unit_quantity ? (
                <span className="text-xs text-muted-foreground ml-1">
                  ({Math.round(baseToPurchase(item.current_quantity, item.purchase_unit_quantity) * 100) / 100} {item.purchase_unit}s)
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{"\u2014"}</span>
          )}
        </TableCell>

        {/* Par Level — hidden on mobile */}
        <TableCell className="hidden md:table-cell text-right">
          {item.par_level != null ? (
            <span>
              {item.par_level} {item.unit || ""}
            </span>
          ) : (
            <span className="text-muted-foreground">{"\u2014"}</span>
          )}
        </TableCell>

        {/* Status — hidden on mobile */}
        <TableCell className="hidden md:table-cell">
          <Badge variant={status.variant}>{status.label}</Badge>
        </TableCell>

        {/* Counted At — hidden on mobile */}
        <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
          {item.last_counted_at
            ? new Date(item.last_counted_at).toLocaleDateString()
            : "Never"}
        </TableCell>

        {/* Actions — hidden on mobile (count via Expected Inventory tap, rest via detail modal) */}
        <TableCell className="hidden md:table-cell text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCountDialogItem(item)}
            >
              Count
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsDialogItem(item)}
              title="Settings"
            >
              <SettingsIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryDialogItem(item)}
              title="Count history"
            >
              <HistoryIcon />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            {recalculating ? "Recalculating..." : "Recalculate Expected"}
          </Button>
          {summary && (
            <div className="hidden md:flex gap-2">
              <Badge variant="secondary">{summary.total} ingredients</Badge>
              <Badge variant="secondary">{summary.counted} counted</Badge>
              {summary.belowPar > 0 && (
                <Badge variant="destructive">{summary.belowPar} below par</Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Summary cards — hidden on mobile */}
      {summary && (
        <div className="hidden md:grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Ingredients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Counted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.counted}</div>
              <p className="text-xs text-muted-foreground">
                {summary.total - summary.counted} not yet counted
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Below Par Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.belowPar > 0 ? "text-destructive" : ""}`}>
                {summary.belowPar}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.categories}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search ingredients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant={groupByCategory ? "default" : "outline"}
          size="sm"
          onClick={() => setGroupByCategory((g) => !g)}
        >
          Group by Category
        </Button>
      </div>

      {/* Inventory table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading inventory...</p>
          ) : sorted.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {items.length === 0
                ? "No ingredients found. Sync recipes from xtraCHEF in Settings to populate ingredients."
                : "No ingredients match your search."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Name"
                    field="name"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHead
                    field="expected_quantity"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="text-right"
                  >
                    {/* Icon on mobile, full text on desktop */}
                    <span className="md:hidden inline-flex items-center" title="Expected Inventory"><ExpectedIcon /></span>
                    <span className="hidden md:inline">Expected Inventory</span>
                  </SortableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Last Count</TableHead>
                  <SortableHead
                    label="Par Level"
                    field="par_level"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell text-right"
                  />
                  <SortableHead
                    label="Status"
                    field="status"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                  <TableHead className="hidden md:table-cell text-right">Counted At</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups
                  ? groups.map(([category, groupItems]) => (
                      <Fragment key={category}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={COL_COUNT} className="font-semibold">
                            {category}
                            <span className="ml-2 text-muted-foreground font-normal text-sm">
                              ({groupItems.length} ingredient{groupItems.length !== 1 ? "s" : ""})
                            </span>
                          </TableCell>
                        </TableRow>
                        {groupItems.map(renderRow)}
                      </Fragment>
                    ))
                  : sorted.map(renderRow)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CountDialog
        ingredient={countDialogItem}
        open={!!countDialogItem}
        onOpenChange={(open) => !open && setCountDialogItem(null)}
        onSaved={fetchInventory}
      />
      <SettingsDialog
        ingredient={settingsDialogItem}
        open={!!settingsDialogItem}
        onOpenChange={(open) => !open && setSettingsDialogItem(null)}
        onSaved={fetchInventory}
      />
      <HistoryDialog
        ingredient={historyDialogItem}
        open={!!historyDialogItem}
        onOpenChange={(open) => !open && setHistoryDialogItem(null)}
      />
      <IngredientDetailDialog
        ingredient={detailDialogItem}
        open={!!detailDialogItem}
        onOpenChange={(open) => !open && setDetailDialogItem(null)}
        onOpenSettings={setSettingsDialogItem}
        onOpenHistory={setHistoryDialogItem}
      />
    </div>
  );
}
