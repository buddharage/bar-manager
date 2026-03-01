import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PayrollPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <a
            href="https://payroll.toasttab.com/witchinghour/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Open in Toast Payroll &darr;
          </a>
        </div>
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
