import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BookkeepingPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bookkeeping</h1>
        <Badge variant="secondary">Phase 2</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>QuickBooks Online Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Bookkeeping sync will be available in Phase 2. It will automatically create
            daily journal entries in QuickBooks Online from your Toast sales data,
            breaking down revenue, COGS, and tax collected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
