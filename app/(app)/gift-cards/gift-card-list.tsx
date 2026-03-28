"use client";

import { useState, useMemo } from "react";
import { GiftCard } from "@/lib/supabase/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusVariant: Record<
  GiftCard["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  depleted: "secondary",
  expired: "outline",
  voided: "destructive",
};

type SortKey =
  | "card_id"
  | "beginning_balance"
  | "current_balance"
  | "status"
  | "issued_date";

const emptyForm = {
  card_id: "",
  beginning_balance: "",
  current_balance: "",
  status: "active" as GiftCard["status"],
  issued_date: "",
  last_used_date: "",
  purchaser_name: "",
  recipient_name: "",
  notes: "",
};

export function GiftCardList({
  initialCards,
}: {
  initialCards: GiftCard[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("card_id");
  const [sortAsc, setSortAsc] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<GiftCard | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = cards;
    if (q) {
      list = list.filter(
        (c) =>
          c.card_id.toLowerCase().includes(q) ||
          c.purchaser_name?.toLowerCase().includes(q) ||
          c.recipient_name?.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "beginning_balance" || sortKey === "current_balance") {
        av = a[sortKey];
        bv = b[sortKey];
      } else if (sortKey === "issued_date") {
        av = a.issued_date || "";
        bv = b.issued_date || "";
      } else {
        av = (a[sortKey] || "").toString().toLowerCase();
        bv = (b[sortKey] || "").toString().toLowerCase();
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [cards, search, sortKey, sortAsc]);

  const totalLiability = useMemo(
    () => cards.filter((c) => c.status === "active").reduce((s, c) => s + c.current_balance, 0),
    [cards],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortAsc ? " ↑" : " ↓";
  }

  function openAdd() {
    setEditingCard(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(card: GiftCard) {
    setEditingCard(card);
    setForm({
      card_id: card.card_id,
      beginning_balance: String(card.beginning_balance),
      current_balance: String(card.current_balance),
      status: card.status,
      issued_date: card.issued_date || "",
      last_used_date: card.last_used_date || "",
      purchaser_name: card.purchaser_name || "",
      recipient_name: card.recipient_name || "",
      notes: card.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.card_id || !form.beginning_balance) return;
    setSaving(true);

    const payload = {
      card_id: form.card_id,
      beginning_balance: Number(form.beginning_balance),
      current_balance: form.current_balance
        ? Number(form.current_balance)
        : Number(form.beginning_balance),
      status: form.status,
      issued_date: form.issued_date || null,
      last_used_date: form.last_used_date || null,
      purchaser_name: form.purchaser_name || null,
      recipient_name: form.recipient_name || null,
      notes: form.notes || null,
    };

    try {
      if (editingCard) {
        const res = await fetch(`/api/gift-cards/${editingCard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update");
        const { gift_card } = await res.json();
        setCards((prev) =>
          prev.map((c) => (c.id === editingCard.id ? gift_card : c)),
        );
      } else {
        const res = await fetch("/api/gift-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create");
        const { gift_card } = await res.json();
        setCards((prev) => [gift_card, ...prev]);
      }
      setDialogOpen(false);
    } catch {
      // keep dialog open so user can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(card: GiftCard) {
    if (!confirm(`Delete gift card ${card.card_id}?`)) return;
    const res = await fetch(`/api/gift-cards/${card.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gift Cards</h1>
        <div className="text-sm text-muted-foreground">
          Outstanding liability:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totalLiability)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by card ID, name, or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={openAdd}>Add Gift Card</Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("card_id")}
              >
                Card ID{sortIndicator("card_id")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("beginning_balance")}
              >
                Beginning Balance{sortIndicator("beginning_balance")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("current_balance")}
              >
                Current Balance{sortIndicator("current_balance")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("status")}
              >
                Status{sortIndicator("status")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("issued_date")}
              >
                Issued{sortIndicator("issued_date")}
              </TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Purchaser</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground py-8"
                >
                  {search ? "No gift cards match your search." : "No gift cards yet. Add one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="font-medium">{card.card_id}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(card.beginning_balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(card.current_balance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[card.status]}>
                      {card.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(card.issued_date)}</TableCell>
                  <TableCell>{formatDate(card.last_used_date)}</TableCell>
                  <TableCell>{card.purchaser_name || "—"}</TableCell>
                  <TableCell>{card.recipient_name || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {card.notes || "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <button
                      onClick={() => openEdit(card)}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(card)}
                      className="text-sm text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {search ? "No gift cards match your search." : "No gift cards yet. Add one to get started."}
          </p>
        ) : (
          filtered.map((card) => (
            <div
              key={card.id}
              className="rounded-lg border p-4 space-y-2"
              onClick={() => openEdit(card)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{card.card_id}</span>
                <Badge variant={statusVariant[card.status]}>
                  {card.status}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Beginning</span>
                <span>{formatCurrency(card.beginning_balance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current</span>
                <span className="font-medium">
                  {formatCurrency(card.current_balance)}
                </span>
              </div>
              {card.purchaser_name && (
                <div className="text-sm text-muted-foreground">
                  Purchaser: {card.purchaser_name}
                </div>
              )}
              {card.recipient_name && (
                <div className="text-sm text-muted-foreground">
                  Recipient: {card.recipient_name}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCard ? "Edit Gift Card" : "Add Gift Card"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="gc-card-id">Card ID *</Label>
              <Input
                id="gc-card-id"
                value={form.card_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, card_id: e.target.value }))
                }
                placeholder="e.g. GC-001 or card number"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="gc-beginning">Beginning Balance *</Label>
                <Input
                  id="gc-beginning"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.beginning_balance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      beginning_balance: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gc-current">Current Balance</Label>
                <Input
                  id="gc-current"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.current_balance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      current_balance: e.target.value,
                    }))
                  }
                  placeholder="Same as beginning"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gc-status">Status</Label>
              <select
                id="gc-status"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as GiftCard["status"],
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="active">Active</option>
                <option value="depleted">Depleted</option>
                <option value="expired">Expired</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="gc-issued">Issued Date</Label>
                <Input
                  id="gc-issued"
                  type="date"
                  value={form.issued_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issued_date: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gc-last-used">Last Used Date</Label>
                <Input
                  id="gc-last-used"
                  type="date"
                  value={form.last_used_date}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      last_used_date: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="gc-purchaser">Purchaser Name</Label>
                <Input
                  id="gc-purchaser"
                  value={form.purchaser_name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      purchaser_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gc-recipient">Recipient Name</Label>
                <Input
                  id="gc-recipient"
                  value={form.recipient_name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recipient_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gc-notes">Notes</Label>
              <textarea
                id="gc-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.card_id || !form.beginning_balance}
            >
              {saving
                ? "Saving…"
                : editingCard
                  ? "Save Changes"
                  : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
