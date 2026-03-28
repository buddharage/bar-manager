"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
interface WhiteboardSnapshot {
  id: number;
  captured_at: string;
  extracted_text: string | null;
  summary: string | null;
  schedule_label: string | null;
  status: string;
  error: string | null;
}

const SCHEDULE_LABELS: Record<string, string> = {
  morning: "11 AM",
  evening: "6 PM",
  night: "10 PM",
};

export default function WhiteboardPage() {
  const [snapshots, setSnapshots] = useState<WhiteboardSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    let cancelled = false;
    supabaseRef.current
      .from("whiteboard_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(50)
      .then(
        ({ data }) => {
          if (!cancelled) {
            setSnapshots((data as WhiteboardSnapshot[]) || []);
            setLoading(false);
          }
        },
        () => {
          if (!cancelled) setLoading(false);
        },
      );
    return () => { cancelled = true; };
  }, []);

  async function loadSnapshots() {
    const { data } = await supabaseRef.current
      .from("whiteboard_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(50);
    setSnapshots((data as WhiteboardSnapshot[]) || []);
  }

  async function triggerCapture() {
    setCapturing(true);
    setCaptureResult(null);
    try {
      const res = await fetch("/api/sync/whiteboard", { method: "POST" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) {
        setCaptureResult({ type: "error", message: data.details || data.error });
      } else {
        setCaptureResult({
          type: "success",
          message: data.changed
            ? "Whiteboard captured — new content detected"
            : "Whiteboard captured — no changes since last capture",
        });
      }
      await loadSnapshots();
    } catch (err) {
      setCaptureResult({ type: "error", message: String(err) });
    } finally {
      setCapturing(false);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading whiteboard history...</p>
      </div>
    );
  }

  // Group snapshots by date
  const grouped = snapshots.reduce<Record<string, WhiteboardSnapshot[]>>((acc, snap) => {
    const dateKey = formatDate(snap.captured_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(snap);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Whiteboard</h1>
        <Button onClick={triggerCapture} disabled={capturing}>
          {capturing ? "Capturing..." : "Capture Now"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Automatic captures at 11 AM, 6 PM, and 10 PM daily. Notifications are sent when content changes.
      </p>

      {captureResult && (
        <div
          className={`rounded border p-3 text-sm ${
            captureResult.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {captureResult.message}
        </div>
      )}

      {snapshots.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No whiteboard captures yet. Click &quot;Capture Now&quot; or wait for the next scheduled capture.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([dateLabel, daySnapshots]) => (
          <div key={dateLabel} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">{dateLabel}</h2>
            {daySnapshots.map((snap) => {
              const isExpanded = expandedId === snap.id;
              return (
                <Card
                  key={snap.id}
                  className={snap.status === "error" ? "border-destructive/50" : ""}
                >
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-medium">
                          {formatTime(snap.captured_at)}
                        </CardTitle>
                        {snap.schedule_label && (
                          <Badge variant="secondary">
                            {SCHEDULE_LABELS[snap.schedule_label] || snap.schedule_label}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            snap.status === "success"
                              ? "default"
                              : snap.status === "no_change"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {snap.status === "no_change" ? "unchanged" : snap.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {isExpanded ? "Click to collapse" : "Click to expand"}
                      </span>
                    </div>
                    {/* Always show summary preview */}
                    {snap.summary && !isExpanded && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {snap.summary}
                      </p>
                    )}
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4">
                      {snap.error && (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                          {snap.error}
                        </div>
                      )}

                      {snap.summary && (
                        <div>
                          <h3 className="text-sm font-medium mb-2">Summary</h3>
                          <div className="whitespace-pre-wrap text-sm bg-muted/50 rounded p-3">
                            {snap.summary}
                          </div>
                        </div>
                      )}

                      {snap.extracted_text && (
                        <div>
                          <h3 className="text-sm font-medium mb-2">Raw Text</h3>
                          <div className="whitespace-pre-wrap text-sm font-mono bg-muted/50 rounded p-3 text-muted-foreground">
                            {snap.extracted_text}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
