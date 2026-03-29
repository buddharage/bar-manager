"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

import { splitSections, joinSections, headingToId, type Section } from "@/lib/docs/sections";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";


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

// ---------------------------------------------------------------------------
// Section Editor
// ---------------------------------------------------------------------------

function SectionEditor({
  section,
  index,
  totalSections,
  onSave,
  onCancel,
  onDelete,
  onMove,
}: {
  section: Section;
  index: number;
  totalSections: number;
  onSave: (heading: string, body: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const isIntro = index === 0 && !section.heading;
  const [heading, setHeading] = useState(section.heading);
  const [body, setBody] = useState(section.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.max(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, []);

  function handleBodyChange(value: string) {
    setBody(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.max(textareaRef.current.scrollHeight, 120) + "px";
    }
  }

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-4 space-y-3">
      {!isIntro && (
        <input
          type="text"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          className="w-full text-xl font-semibold bg-background border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Section heading..."
        />
      )}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
        className="w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        placeholder="Section content (Markdown)..."
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onSave(heading, body)}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {index > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onMove("up")} title="Move up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
            </Button>
          )}
          {index < totalSections - 1 && (
            <Button size="sm" variant="ghost" onClick={() => onMove("down")} title="Move down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </Button>
          )}
          {!(isIntro) && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(`Delete section "${heading}"?`)) onDelete();
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section View
// ---------------------------------------------------------------------------

function SectionView({
  section,
  onEdit,
}: {
  section: Section;
  onEdit: () => void;
}) {
  const markdown = section.heading
    ? `## ${section.heading}\n\n${section.body}`
    : section.body;

  if (!markdown.trim()) return null;

  const sectionId = section.heading ? headingToId(section.heading) : undefined;

  return (
    <div id={sectionId} className="group relative">
      <div className="rounded-lg px-2 py-1 -mx-2">
        {/* Edit button — visible on hover, top-right */}
        <button
          onClick={onEdit}
          className="absolute right-2 top-2 hidden group-hover:flex items-center justify-center h-7 w-7 rounded border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
          title="Edit section"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            <path d="m15 5 4 4"/>
          </svg>
        </button>
        <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-thead:border-border prose-tr:border-border prose-h2:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, href, ...props }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              ),
              table: ({ children, ...props }) => (
                <div className="overflow-x-auto">
                  <table {...props}>{children}</table>
                </div>
              ),
              h2: ({ children, ...props }) => (
                <h2 className="text-2xl font-semibold" {...props}>
                  {children}
                </h2>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Section Button
// ---------------------------------------------------------------------------

function AddSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative my-8 group/add">
      <hr className="border-border" />
      <button
        onClick={onClick}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover/add:opacity-100 transition-opacity rounded-md border border-dashed bg-background px-3 py-1"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Add section
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<DocVersion | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const sections = useMemo(() => splitSections(doc?.content || ""), [doc?.content]);
  const headings = useMemo(
    () =>
      sections
        .filter((s) => s.heading)
        .map((s) => ({ id: headingToId(s.heading), text: s.heading })),
    [sections],
  );


  // Load the cheat-sheet doc
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/docs?slug=cheat-sheet");
        if (!res.ok) throw new Error("Failed to load document");
        const data = await res.json();
        if (data.doc) {
          setDoc(data.doc);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save full document
  const saveDoc = useCallback(
    async (content: string) => {
      if (!doc) return;
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/docs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: doc.id, title: doc.title, content }),
        });
        if (!res.ok) throw new Error("Failed to save");
        const data = await res.json();
        setDoc(data.doc);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [doc],
  );

  // Save a single section edit
  const saveSection = useCallback(
    (index: number, heading: string, body: string) => {
      const updated = [...sections];
      updated[index] = { heading, body };
      const content = joinSections(updated);
      saveDoc(content);
      setEditingIndex(null);
    },
    [sections, saveDoc],
  );

  // Delete a section
  const deleteSection = useCallback(
    (index: number) => {
      const updated = sections.filter((_, i) => i !== index);
      const content = joinSections(updated);
      saveDoc(content);
      setEditingIndex(null);
    },
    [sections, saveDoc],
  );

  // Move a section up or down
  const moveSection = useCallback(
    (index: number, direction: "up" | "down") => {
      const updated = [...sections];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= updated.length) return;
      [updated[index], updated[target]] = [updated[target], updated[index]];
      const content = joinSections(updated);
      saveDoc(content);
      setEditingIndex(target);
    },
    [sections, saveDoc],
  );

  // Insert a new section after the given index
  const addSection = useCallback(
    (afterIndex: number) => {
      const updated = [...sections];
      updated.splice(afterIndex + 1, 0, { heading: "New Section", body: "" });
      // Save immediately so the section exists, then open editor
      const content = joinSections(updated);
      saveDoc(content);
      setEditingIndex(afterIndex + 1);
    },
    [sections, saveDoc],
  );

  // Scroll to heading
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Set scroll-margin dynamically to clear sticky nav
    el.style.scrollMarginTop = "120px";
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Load versions
  const loadVersions = useCallback(async () => {
    if (!doc) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/docs?versions=true&doc_id=${doc.id}`);
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
          body: JSON.stringify({ action: "restore", version_id: versionId, doc_id: doc.id }),
        });
        if (!res.ok) throw new Error("Failed to restore version");
        const data = await res.json();
        setDoc(data.doc);
        setSaveStatus("saved");
        setPreviewVersion(null);
        setHistoryOpen(false);
        setEditingIndex(null);
      } catch {
        setSaveStatus("error");
      }
    },
    [doc],
  );

  const statusBadge = {
    saved: <Badge variant="outline" className="text-emerald-600 border-emerald-200">Saved</Badge>,
    saving: <Badge variant="outline" className="text-amber-600 border-amber-200">Saving...</Badge>,
    unsaved: <Badge variant="outline" className="text-amber-600 border-amber-200">Unsaved changes</Badge>,
    error: <Badge variant="destructive">Error saving</Badge>,
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
    <div className="mx-auto max-w-6xl px-6 sm:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Docs</h1>
          <div className="group relative">
            <button
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="How to use this page"
            >
              ?
            </button>
            <div className="absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md group-hover:block">
              <p className="font-medium mb-1.5">How to use this page</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li><strong>Click the pencil icon</strong> on a section to edit it</li>
                <li>Hover between sections to <strong>add a new section</strong></li>
                <li>Use <strong>arrows</strong> to reorder and <strong>Delete</strong> to remove sections</li>
                <li>Click <strong>History</strong> to view or restore past versions</li>
                <li>Use the <strong>sidebar</strong> to jump between sections</li>
              </ul>
            </div>
          </div>
          {statusBadge[saveStatus]}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/docs/print"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
              <rect x="6" y="14" width="12" height="8" rx="1" />
            </svg>
            <span className="hidden sm:inline">Print</span>
          </a>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                <span className="hidden sm:inline">History</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Version History</DialogTitle>
              </DialogHeader>
              {versionsLoading ? (
                <p className="text-sm text-muted-foreground py-4">Loading versions...</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No previous versions yet.</p>
              ) : previewVersion ? (
                <div className="flex-1 overflow-auto space-y-3">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewVersion(null)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m15 18-6-6 6-6" /></svg>
                      Back
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatTimestamp(previewVersion.created_at)}</span>
                      <Button size="sm" onClick={() => restoreVersion(previewVersion.id)}>Restore this version</Button>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 overflow-auto max-h-[55vh]">
                    <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-thead:border-border prose-tr:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewVersion.content}</ReactMarkdown>
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
                        <span className="text-xs text-muted-foreground">{formatTimestamp(v.created_at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <a
            href="https://docs.google.com/document/d/1JvCll4sP5ut45BKAIwpBZUlWMTxC8j8BSy6lBVxws6g/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            <span className="hidden sm:inline">Original Google Doc</span>
          </a>
        </div>
      </div>

      {/* Mobile: horizontal section links — sticky */}
      {headings.length > 0 && (
        <div className="lg:hidden sticky top-0 z-10 -mx-6 sm:-mx-8 px-6 sm:px-8 py-4 bg-background border-b mb-4 overflow-x-auto">
          <div className="flex gap-2">
            {headings.map((h) => (
              <button
                key={h.id}
                onClick={() => scrollToHeading(h.id)}
                className="shrink-0 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative z-10"
              >
                {h.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex gap-6">
        {/* Desktop sidebar */}
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

        {/* Sections */}
        <div className="flex-1 min-w-0 space-y-1">
          {sections.map((section, i) => (
            <div key={`${i}-${section.heading}`}>
              {editingIndex === i ? (
                <SectionEditor
                  section={section}
                  index={i}
                  totalSections={sections.length}
                  onSave={(heading, body) => saveSection(i, heading, body)}
                  onCancel={() => setEditingIndex(null)}
                  onDelete={() => deleteSection(i)}
                  onMove={(dir) => moveSection(i, dir)}
                />
              ) : (
                <SectionView
                  section={section}
                  onEdit={() => setEditingIndex(i)}
                />
              )}
              <AddSectionButton onClick={() => addSection(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
