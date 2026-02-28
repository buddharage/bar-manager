"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DatePreset =
  | "today"
  | "yesterday"
  | "past_week"
  | "past_month"
  | "last_year"
  | "this_year"
  | "all_time"
  | "custom";

type SortField = "name" | "quantity" | "revenue";
type SortDirection = "asc" | "desc";
type GroupBy = "none" | "category";

interface MenuSaleItem {
  name: string;
  category: string;
  size: string | null;
  quantity: number;
  revenue: number;
}

interface SalesSummary {
  uniqueItems: number;
  totalQuantity: number;
  totalRevenue: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getDateRange(preset: DatePreset): { start: string; end: string } | null {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (preset) {
    case "today":
      return { start: fmt(today), end: fmt(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }
    case "past_week": {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { start: fmt(w), end: fmt(today) };
    }
    case "past_month": {
      const m = new Date(today);
      m.setMonth(m.getMonth() - 1);
      return { start: fmt(m), end: fmt(today) };
    }
    case "last_year": {
      const ly = today.getFullYear() - 1;
      return { start: `${ly}-01-01`, end: `${ly}-12-31` };
    }
    case "this_year": {
      return { start: `${today.getFullYear()}-01-01`, end: fmt(today) };
    }
    case "all_time":
      return null;
    case "custom":
      return null;
  }
}

const presets: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "past_week", label: "Past Week" },
  { key: "past_month", label: "Past Month" },
  { key: "this_year", label: "This Year" },
  { key: "last_year", label: "Last Year" },
  { key: "all_time", label: "All Time" },
  { key: "custom", label: "Custom" },
];

function SortIndicator({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) {
    return <span className="ml-1 text-muted-foreground/40">{"\u2195"}</span>;
  }
  return (
    <span className="ml-1">
      {sortDirection === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
}

export default function MenuSalesPage() {
  const [activePreset, setActivePreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [items, setItems] = useState<MenuSaleItem[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("quantity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const fetchSales = useCallback(
    async (startDate: string | null, endDate: string | null) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      try {
        const res = await fetch(`/api/menu-sales?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to fetch sales data");
        }
        const data = await res.json();
        setItems(data.items);
        setSummary(data.summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setItems([]);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activePreset === "custom") return;
    const range = getDateRange(activePreset);
    fetchSales(range?.start ?? null, range?.end ?? null);
  }, [activePreset, fetchSales]);

  const handlePresetClick = (preset: DatePreset) => {
    setActivePreset(preset);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    fetchSales(customStart, customEnd);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "revenue":
          cmp = a.revenue - b.revenue;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [items, sortField, sortDirection]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;

    const map = new Map<string, MenuSaleItem[]>();
    for (const item of sortedItems) {
      const key = item.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sortedItems, groupBy]);

  const hasCategories = useMemo(() => {
    return items.some((item) => item.category && item.category !== "Uncategorized");
  }, [items]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Menu Sales</h1>

      {/* Date filter presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.key}
            variant={activePreset === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom date range inputs */}
      {activePreset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Start Date
            </label>
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              End Date
            </label>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
          >
            Apply
          </Button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unique Items Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.uniqueItems}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Quantity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totalQuantity.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.totalRevenue)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sales table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Items Sold</CardTitle>
            <div className="flex items-center gap-2">
              {hasCategories && (
                <Button
                  variant={groupBy === "category" ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setGroupBy((g) => (g === "none" ? "category" : "none"))
                  }
                >
                  Group by Category
                </Button>
              )}
              {summary && (
                <Badge variant="secondary">
                  {summary.uniqueItems} item{summary.uniqueItems !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No sales data for the selected period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center hover:text-foreground transition-colors"
                      onClick={() => handleSort("name")}
                    >
                      Menu Item
                      <SortIndicator field="name" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center ml-auto hover:text-foreground transition-colors"
                      onClick={() => handleSort("quantity")}
                    >
                      Qty Sold
                      <SortIndicator field="quantity" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center ml-auto hover:text-foreground transition-colors"
                      onClick={() => handleSort("revenue")}
                    >
                      Revenue
                      <SortIndicator field="revenue" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups
                  ? groups.map(([category, groupItems]) => {
                      const groupQty = groupItems.reduce((s, i) => s + i.quantity, 0);
                      const groupRev = groupItems.reduce((s, i) => s + i.revenue, 0);
                      return (
                        <Fragment key={category}>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell />
                            <TableCell className="font-semibold">
                              {category}
                              <span className="ml-2 text-muted-foreground font-normal text-sm">
                                ({groupItems.length} item{groupItems.length !== 1 ? "s" : ""})
                              </span>
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right font-semibold">
                              {groupQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(groupRev)}
                            </TableCell>
                          </TableRow>
                          {groupItems.map((item, idx) => (
                            <TableRow key={`${item.name}-${item.size}`}>
                              <TableCell className="text-muted-foreground pl-6">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="font-medium pl-6">
                                {item.name}
                              </TableCell>
                              <TableCell>
                                {item.size && (
                                  <Badge variant="outline">{item.size}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.quantity.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.revenue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })
                  : sortedItems.map((item, index) => (
                      <TableRow key={`${item.name}-${item.size}`}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          {item.size && (
                            <Badge variant="outline">{item.size}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
