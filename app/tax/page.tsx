import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function TaxPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales Tax</h1>
        <Badge variant="secondary">Phase 2</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>NYC ST-100 Worksheet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Sales tax filing assistant will be available in Phase 2. It will automatically
            compute ST-100 form fields from your Toast sales data, applying NYC&apos;s 8.875%
            combined rate (4% state + 4.5% city + 0.375% MCTD).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
