"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "model";
  content: string;
}

const EXAMPLE_QUESTIONS = [
  { icon: "📊", text: "How did we do last Saturday?" },
  { icon: "🍸", text: "What are our top 5 cocktails this month?" },
  { icon: "📦", text: "Show me items below par level" },
  { icon: "🧾", text: "What was our last Sysco invoice?" },
  { icon: "📁", text: "What's in the Operations folder?" },
  { icon: "🔄", text: "Show me recent sync logs" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  async function sendMessage(content?: string) {
    const text = content || input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (data.push) {
        const p = data.push;
        if (p.error) {
          console.error("[Push] Server error sending notification:", p.error);
        } else if (p.sent === 0 && p.failed === 0) {
          console.error(`[Push] No notifications sent (userId="${p.userId}"). Check subscriptions and preferences.`);
        } else {
          console.log(`[Push] Notification result: sent=${p.sent}, failed=${p.failed}, userId="${p.userId}"`);
        }
      }

      if (data.error) {
        setMessages([...newMessages, { role: "model", content: `Error: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: "model", content: data.response }]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "model", content: "Failed to reach AI. Check your connection and API key." },
      ]);
    }

    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center px-4 animate-in fade-in duration-500">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Ask me anything about your bar</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                I can check inventory, analyze sales, search emails, look up recipes, and more.
              </p>
            </div>

            <div className="grid w-full max-w-lg grid-cols-2 gap-2">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q.text)}
                  className="group flex items-start gap-2 rounded-xl border bg-card p-3 text-left text-sm transition-all hover:bg-accent hover:shadow-md animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${i * 75}ms`, animationFillMode: "both" }}
                >
                  <span className="text-base leading-none mt-0.5">{q.icon}</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="mx-auto max-w-3xl space-y-1 px-4 py-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                style={{ animationDelay: i === messages.length - 1 ? "0ms" : "0ms" }}
              >
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-2">
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-thead:border-border prose-tr:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="py-2 animate-in fade-in duration-300">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about inventory, sales, scheduling..."
              disabled={loading}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="sm"
              className="h-8 w-8 shrink-0 rounded-xl p-0 transition-transform active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground/60">
            Powered by Gemini. Responses may contain errors.
          </p>
        </div>
      </div>
    </div>
  );
}
