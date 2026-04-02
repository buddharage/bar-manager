"use client";

import { useState, useEffect, useCallback } from "react";
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

interface WeeklyTaxRow {
  weekStart: string;
  weekEnd: string;
  grossSales: number;
  taxableSales: number;
  taxCollected: number;
  totalTaxDue: number;
  variance: number;
  stateTaxDue: number;
  cityTaxDue: number;
  mctdTaxDue: number;
}

interface TaxSummary {
  totalCollected: number;
  totalDue: number;
  totalVariance: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function VarianceBadge({ variance }: { variance: number }) {
  if (Math.abs(variance) < 0.01) {
    return <Badge variant="outline">Even</Badge>;
  }
  if (variance > 0) {
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/10">+{formatCurrency(variance)}</Badge>;
  }
  return <Badge variant="destructive">{formatCurrency(variance)}</Badge>;
}

function TaxDueCard({ totalDue }: { totalDue: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const raw = totalDue.toFixed(2);
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [totalDue]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Tax Due</CardTitle>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={handleCopy}
          className="group flex items-center gap-2 text-2xl font-bold transition-colors hover:text-primary cursor-pointer"
          title="Click to copy"
        >
          {formatCurrency(totalDue)}
          {copied ? (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              Copied!
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-50 transition-opacity"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          )}
        </button>
      </CardContent>
    </Card>
  );
}

export default function SalesTaxPage() {
  const [weeks, setWeeks] = useState<WeeklyTaxRow[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sales-tax");
        if (!res.ok) throw new Error("Failed to load sales tax data");
        const data = await res.json();
        setWeeks(data.weeks || []);
        setSummary(data.summary || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading sales tax data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Tax</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly breakdown (Thu&ndash;Wed) &middot; NYC combined rate 8.875%
          </p>
        </div>
        <a
          href="https://ols.tax.ny.gov/accountSummary"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          NYS Tax Dashboard
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </a>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tax Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalCollected)}</p>
            </CardContent>
          </Card>
          <TaxDueCard totalDue={summary.totalDue} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{formatCurrency(Math.abs(summary.totalVariance))}</p>
                <VarianceBadge variance={summary.totalVariance} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Weekly Table */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Gross Sales</TableHead>
                <TableHead className="text-right">Taxable Sales</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No sales data available
                  </TableCell>
                </TableRow>
              ) : (
                weeks.map((week) => (
                  <TableRow key={week.weekStart}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatDateShort(week.weekStart)} &ndash; {formatDateShort(week.weekEnd)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(week.grossSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(week.taxableSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(week.taxCollected)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(week.totalTaxDue)}</TableCell>
                    <TableCell className="text-right">
                      <VarianceBadge variance={week.variance} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
