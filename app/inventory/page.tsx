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

function stockStatus(current: number, par: number | null) {
  if (current === 0) return { label: "Out of Stock", variant: "destructive" as const };
  if (par && current <= par) return { label: "Low", variant: "default" as const };
  return { label: "OK", variant: "secondary" as const };
}

export default async function InventoryPage() {
  const supabase = createServerClient();

  const { data: items, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load inventory: {error.message}</p>
      </div>
    );
  }

  const categories = [...new Set((items || []).map((i) => i.category || "Uncategorized"))];
  const lowStockCount = (items || []).filter(
    (i) => i.par_level && i.current_stock <= i.par_level
  ).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">{items?.length || 0} items</Badge>
          {lowStockCount > 0 && (
            <Badge variant="destructive">{lowStockCount} low stock</Badge>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items?.length || 0}</div>
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
              Below Par Level
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory table */}
      <Card>
        <CardContent className="pt-6">
          {!items || items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No inventory items yet. Run a Toast sync to populate inventory data.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Par Level</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const status = stockStatus(item.current_stock, item.par_level);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category || "—"}</TableCell>
                      <TableCell className="text-right">{item.current_stock}</TableCell>
                      <TableCell className="text-right">
                        {item.par_level ?? "—"}
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {item.last_synced_at
                          ? new Date(item.last_synced_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
