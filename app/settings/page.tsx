"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface SyncLogEntry {
  id: number;
  source: string;
  status: string;
  records_synced: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

function SettingsContent() {
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    loadSyncLogs();
    checkGoogleConnection();
  }, []);

  // Show connection result from OAuth callback
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (googleStatus === "connected") {
      setGoogleConnected(true);
    }
  }, [searchParams]);

  async function checkGoogleConnection() {
    const supabase = createClient();
    const { data } = await supabase
      .from("settings")
      .select("key")
      .eq("key", "google_tokens")
      .single();
    setGoogleConnected(!!data);
  }

  async function loadSyncLogs() {
    const supabase = createClient();
    const { data } = await supabase
      .from("sync_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    setSyncLogs((data as SyncLogEntry[]) || []);
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/toast", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert(`Sync failed: ${data.error}`);
      } else {
        alert(`Sync complete: ${data.records_synced} records synced`);
      }
      loadSyncLogs();
    } catch (err) {
      alert(`Sync error: ${err}`);
    }
    setSyncing(false);
  }

  async function triggerGoogleSync() {
    setSyncingGoogle(true);

    try {
      const [driveRes, gmailRes] = await Promise.all([
        fetch("/api/sync/google", { method: "POST" }),
        fetch("/api/sync/gmail", { method: "POST" }),
      ]);

      const driveData = await driveRes.json();
      const gmailData = await gmailRes.json();

      const results = [];
      if (driveData.error) results.push(`Drive: ${driveData.error}`);
      else results.push(`Drive: ${driveData.records_synced} files synced`);
      if (gmailData.error) results.push(`Gmail: ${gmailData.error}`);
      else results.push(`Gmail: ${gmailData.records_synced} emails synced`);

      alert(results.join("\n"));
      loadSyncLogs();
    } catch (err) {
      alert(`Google sync error: ${err}`);
    }
    setSyncingGoogle(false);
  }

  async function disconnectGoogle() {
    if (!window.confirm("Disconnect Google account? Synced documents will be preserved.")) return;
    const supabase = createClient();
    await supabase.from("settings").delete().eq("key", "google_tokens");
    setGoogleConnected(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Toast POS</div>
              <div className="text-sm text-muted-foreground">
                Inventory, orders, and sales data
              </div>
            </div>
            <Badge variant={process.env.NEXT_PUBLIC_SUPABASE_URL ? "default" : "secondary"}>
              {process.env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Not configured"}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">QuickBooks Online</div>
              <div className="text-sm text-muted-foreground">
                Bookkeeping and journal entries (Phase 2)
              </div>
            </div>
            <Badge variant="secondary">Phase 2</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Sling</div>
              <div className="text-sm text-muted-foreground">
                Employee scheduling (Phase 3)
              </div>
            </div>
            <Badge variant="secondary">Phase 3</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Gemini AI</div>
              <div className="text-sm text-muted-foreground">
                AI-powered inventory analysis and chat
              </div>
            </div>
            <Badge variant="default">Configured</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Google Workspace */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Google Workspace</CardTitle>
            {googleConnected ? (
              <Badge variant="default">Connected</Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Google account to sync documents from Drive (Finances &amp; Operations folders)
            and receipts/invoices from Gmail. The AI assistant can then search these when answering questions.
          </p>
          {googleConnected ? (
            <div className="flex gap-2">
              <Button onClick={triggerGoogleSync} disabled={syncingGoogle}>
                {syncingGoogle ? "Syncing..." : "Sync Now"}
              </Button>
              <Button variant="outline" onClick={disconnectGoogle}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button asChild>
              <a href="/api/auth/google">Connect Google</a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Manual Sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Data Sync</CardTitle>
            <Button onClick={triggerSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Trigger Toast Sync"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {syncLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync history yet.</p>
          ) : (
            <div className="space-y-2">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        log.status === "success"
                          ? "default"
                          : log.status === "error"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {log.status}
                    </Badge>
                    <span>{log.source}</span>
                    {log.records_synced > 0 && (
                      <span className="text-muted-foreground">
                        {log.records_synced} records
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(log.started_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Environment Info */}
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            Configure API keys and secrets in your <code>.env.local</code> file.
            See <code>.env.local.example</code> for required variables.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
