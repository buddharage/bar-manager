import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SchedulePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <Badge variant="secondary">Phase 3</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Scheduling Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            AI-powered scheduling will be available in Phase 3. It will analyze historical
            sales patterns to suggest optimal staffing levels and create draft schedules
            directly in Sling.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
