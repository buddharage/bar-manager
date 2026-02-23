import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/ai/agent";

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: ChatMessage[] } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const response = await chat(messages);

    return NextResponse.json({ response });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { error: "AI request failed", details: String(error) },
      { status: 500 }
    );
  }
}
