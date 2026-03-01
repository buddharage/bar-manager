"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
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

interface XtrachefStatus {
  lastSync: SyncLogEntry | null;
  recipeCount: number;
  ingredientCount: number;
}

function SettingsContent() {
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [xtrachefStatus, setXtrachefStatus] = useState<XtrachefStatus | null>(null);
  const searchParams = useSearchParams();
  const supabaseRef = useRef(createClient());

  const loadSyncLogs = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("sync_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    setSyncLogs((data as SyncLogEntry[]) || []);
  }, []);

  useEffect(() => {
    loadSyncLogs();
    checkGoogleConnection();
    loadXtrachefStatus();
  }, [loadSyncLogs]);

  // Poll sync logs every 3s while a sync is in progress
  useEffect(() => {
    if (!syncing && !syncingGoogle) return;
    const interval = setInterval(loadSyncLogs, 3000);
    return () => clearInterval(interval);
  }, [syncing, syncingGoogle, loadSyncLogs]);

  // Subscribe to sync_logs changes via Supabase Realtime for external syncs
  useEffect(() => {
    const channel = supabaseRef.current
      .channel("sync_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs" },
        () => { loadSyncLogs(); }
      )
      .subscribe();
    return () => { supabaseRef.current.removeChannel(channel); };
  }, [loadSyncLogs]);

  // Show connection result from OAuth callback
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (googleStatus === "connected") {
      setGoogleConnected(true);
      setGoogleError(null);
    } else if (googleStatus === "error") {
      const message = searchParams.get("message") || "Unknown error";
      setGoogleError(message);
    }
  }, [searchParams]);

  async function checkGoogleConnection() {
    try {
      const res = await fetch("/api/auth/google/status");
      const data = await res.json();
      setGoogleConnected(data.connected);
    } catch {
      setGoogleConnected(false);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/toast", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult({ type: "error", message: `Sync failed: ${data.error}` });
      } else {
        setSyncResult({ type: "success", message: `Sync complete: ${data.records_synced} records synced` });
      }
    } catch (err) {
      setSyncResult({ type: "error", message: `Sync error: ${err}` });
    }
    await loadSyncLogs();
    setSyncing(false);
  }

  async function triggerGoogleSync() {
    setSyncingGoogle(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/google", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        setSyncResult({ type: "error", message: `Drive sync failed: ${data.error}` });
      } else {
        const parts = [`${data.records_synced} files synced`];
        if (data.records_embedded > 0) parts.push(`${data.records_embedded} embedded`);
        if (data.records_deleted > 0) parts.push(`${data.records_deleted} removed`);
        setSyncResult({ type: "success", message: `Drive sync complete: ${parts.join(", ")}` });
      }
    } catch (err) {
      setSyncResult({ type: "error", message: `Google sync error: ${err}` });
    }
    await loadSyncLogs();
    setSyncingGoogle(false);
  }

  async function disconnectGoogle() {
    if (!window.confirm("Disconnect Google account? Synced documents will be preserved.")) return;
    await fetch("/api/auth/google/status", { method: "DELETE" });
    setGoogleConnected(false);
  }

  async function loadXtrachefStatus() {
    try {
      const res = await fetch("/api/sync/xtrachef");
      if (res.ok) {
        const data = await res.json();
        setXtrachefStatus(data);
      }
    } catch {
      // Table may not exist yet
    }
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
            Connect your Google account to give the AI assistant context from your Drive
            (Finances &amp; Operations folders) and Gmail (searched live for receipts &amp; invoices).
            Drive documents are synced and embedded for semantic search. Gmail is queried on demand.
          </p>
          {googleError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <strong>Connection failed:</strong> {googleError}
            </div>
          )}
          {googleConnected ? (
            <div className="flex gap-2">
              <Button onClick={triggerGoogleSync} disabled={syncingGoogle}>
                {syncingGoogle ? "Syncing Drive..." : "Sync Drive"}
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

      {/* xtraCHEF Recipes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>xtraCHEF Recipes</CardTitle>
            {xtrachefStatus?.lastSync?.status === "success" ? (
              <Badge variant="default">Synced</Badge>
            ) : (
              <Badge variant="secondary">Not synced</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sync recipes, prep recipes, and ingredients from xtraCHEF.
            Since xtraCHEF has no public API, syncing uses browser automation
            via Playwright to scrape your recipe data.
          </p>

          {xtrachefStatus && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Recipes</div>
                <div className="text-lg font-semibold">{xtrachefStatus.recipeCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ingredients</div>
                <div className="text-lg font-semibold">{xtrachefStatus.ingredientCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last sync</div>
                <div className="text-lg font-semibold">
                  {xtrachefStatus.lastSync?.completed_at
                    ? new Date(xtrachefStatus.lastSync.completed_at).toLocaleDateString()
                    : "Never"}
                </div>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">How to sync</p>
            <div className="rounded border bg-muted/50 p-3 text-sm space-y-2">
              <p className="text-muted-foreground">
                1. Install Playwright (first time only):
              </p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                npm install -D playwright && npx playwright install chromium
              </code>
              <p className="text-muted-foreground">
                2. Run the sync script (opens browser for login on first run):
              </p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                npx tsx scripts/sync-xtrachef.ts
              </code>
              <p className="text-muted-foreground">
                3. After initial login, run headless for faster syncs:
              </p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                npx tsx scripts/sync-xtrachef.ts --headless
              </code>
            </div>
          </div>
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
        <CardContent className="space-y-3">
          {syncResult && (
            <div
              className={`rounded border p-3 text-sm ${
                syncResult.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              }`}
            >
              {syncResult.message}
            </div>
          )}
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
