"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Doc {
  id: number;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
  created_at: string;
}

interface DocVersion {
  id: number;
  doc_id: number;
  title: string;
  content: string;
  created_at: string;
}

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

function extractHeadings(markdown: string): { id: string; text: string }[] {
  const lines = markdown.split("\n");
  const headings: { id: string; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^## (.+)/);
    if (match) {
      const text = match[1].trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      headings.push({ id, text });
    }
  }
  return headings;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DocsPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<DocVersion | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load the cheat-sheet doc
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/docs?slug=cheat-sheet");
        if (!res.ok) throw new Error("Failed to load document");
        const data = await res.json();
        if (data.doc) {
          setDoc(data.doc);
          setEditContent(data.doc.content);
          setEditTitle(data.doc.title);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save function
  const saveDoc = useCallback(
    async (title: string, content: string) => {
      if (!doc) return;
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/docs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: doc.id, title, content }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const data = await res.json();
        setDoc(data.doc);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [doc]
  );

  // Debounced auto-save
  const debouncedSave = useCallback(
    (title: string, content: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveStatus("unsaved");
      debounceRef.current = setTimeout(() => {
        saveDoc(title, content);
      }, 3000);
    },
    [saveDoc]
  );

  // Handle content change
  const handleContentChange = useCallback(
    (value: string) => {
      setEditContent(value);
      debouncedSave(editTitle, value);
    },
    [editTitle, debouncedSave]
  );

  // Cmd+S / Ctrl+S handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        saveDoc(editTitle, editContent);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editTitle, editContent, saveDoc]);

  // Load versions
  const loadVersions = useCallback(async () => {
    if (!doc) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(
        `/api/docs?versions=true&doc_id=${doc.id}`
      );
      if (!res.ok) throw new Error("Failed to load versions");
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      // silently fail
    } finally {
      setVersionsLoading(false);
    }
  }, [doc]);

  // Restore a version
  const restoreVersion = useCallback(
    async (versionId: number) => {
      if (!doc) return;
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore",
            version_id: versionId,
            doc_id: doc.id,
          }),
        });
        if (!res.ok) throw new Error("Failed to restore version");
        const data = await res.json();
        setDoc(data.doc);
        setEditContent(data.doc.content);
        setEditTitle(data.doc.title);
        setSaveStatus("saved");
        setPreviewVersion(null);
        setHistoryOpen(false);
      } catch {
        setSaveStatus("error");
      }
    },
    [doc]
  );

  // Scroll to heading
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Extract headings from current content
  const headings = useMemo(
    () => extractHeadings(doc?.content || ""),
    [doc?.content]
  );

  const statusBadge = {
    saved: (
      <Badge variant="outline" className="text-emerald-600 border-emerald-200">
        Saved
      </Badge>
    ),
    saving: (
      <Badge variant="outline" className="text-amber-600 border-amber-200">
        Saving...
      </Badge>
    ),
    unsaved: (
      <Badge
        variant="outline"
        className="text-amber-600 border-amber-200"
      >
        Unsaved changes
      </Badge>
    ),
    error: (
      <Badge variant="destructive">Error saving</Badge>
    ),
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading document...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">{error || "Document not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Docs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {doc.title}
          </p>
        </div>
        <a
          href="https://docs.google.com/document/d/1JvCll4sP5ut45BKAIwpBZUlWMTxC8j8BSy6lBVxws6g/edit?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Google Doc
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </a>
      </div>

      <Tabs defaultValue="view">
        <div className="flex items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
          {statusBadge[saveStatus]}
          <div className="ml-auto flex items-center gap-2">
            <Dialog
              open={historyOpen}
              onOpenChange={(open) => {
                setHistoryOpen(open);
                if (open) loadVersions();
                if (!open) setPreviewVersion(null);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1.5"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M12 7v5l4 2" />
                  </svg>
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Version History</DialogTitle>
                </DialogHeader>
                {versionsLoading ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Loading versions...
                  </p>
                ) : versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No previous versions yet.
                  </p>
                ) : previewVersion ? (
                  <div className="flex-1 overflow-auto space-y-3">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewVersion(null)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-1"
                        >
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back
                      </Button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(previewVersion.created_at)}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => restoreVersion(previewVersion.id)}
                        >
                          Restore this version
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 overflow-auto max-h-[55vh]">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-thead:border-border prose-tr:border-border">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {previewVersion.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto max-h-[60vh]">
                    <div className="space-y-1">
                      {versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setPreviewVersion(v)}
                          className="w-full text-left rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                        >
                          <span className="font-medium">{v.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(v.created_at)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* View Mode */}
        <TabsContent value="view">
          <div className="flex gap-6">
            {/* Sidebar - hidden on mobile */}
            {headings.length > 0 && (
              <nav className="hidden lg:block w-48 shrink-0">
                <div className="sticky top-6 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    On this page
                  </p>
                  {headings.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => scrollToHeading(h.id)}
                      className="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-1 truncate"
                    >
                      {h.text}
                    </button>
                  ))}
                </div>
              </nav>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0" ref={contentRef}>
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-thead:border-border prose-tr:border-border">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children, ...props }) => {
                      const text = String(children);
                      const id = text
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, "")
                        .replace(/\s+/g, "-");
                      return (
                        <h2 id={id} {...props}>
                          {children}
                        </h2>
                      );
                    },
                  }}
                >
                  {doc.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Edit Mode */}
        <TabsContent value="edit">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  saveDoc(editTitle, editContent);
                }}
                disabled={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving..." : "Save"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Cmd+S to save
              </span>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full min-h-[70vh] rounded-lg border bg-background p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              spellCheck={false}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
