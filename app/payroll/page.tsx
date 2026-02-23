import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PayrollPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payroll</h1>
        <Badge variant="secondary">Phase 3</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Payroll management will be available in Phase 3. It will pull time entries
            from Toast, calculate hours and overtime, and pre-fill payroll data for
            Toast Payroll submission.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
