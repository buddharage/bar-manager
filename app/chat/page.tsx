"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "model";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
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

      if (data.error) {
        setMessages([
          ...newMessages,
          { role: "model", content: `Error: ${data.error}` },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: "model", content: data.response },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "model", content: "Failed to reach AI. Check your connection and API key." },
      ]);
    }

    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="text-2xl font-semibold mb-4">AI Chat</h1>

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground space-y-2">
              <p className="text-lg">Ask me anything about your bar</p>
              <div className="text-sm space-y-1">
                <p>&quot;How did we do last Saturday?&quot;</p>
                <p>&quot;What are our top 5 cocktails this month?&quot;</p>
                <p>&quot;When should I reorder Tito&apos;s?&quot;</p>
                <p>&quot;Show me items below par level&quot;</p>
                <p>&quot;What was our last Sysco invoice?&quot;</p>
                <p>&quot;What&apos;s in the Operations folder?&quot;</p>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <Card
              className={`max-w-[80%] ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              <CardContent className="py-3 px-4">
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </CardContent>
            </Card>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <Card>
              <CardContent className="py-3 px-4">
                <div className="text-sm text-muted-foreground">Thinking...</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about inventory, sales, scheduling..."
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
