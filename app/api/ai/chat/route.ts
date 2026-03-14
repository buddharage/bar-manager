import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/ai/agent";
import { sendPushNotification } from "@/lib/notifications/push";

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: ChatMessage[] } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const { response, usage } = await chat(messages);

    // Always send the push notification — the service worker will suppress
    // it if the user is actively viewing the chat page. The old approach of
    // checking an x-tab-active header was broken: the header captured tab
    // state at request time (always "true" since the user just clicked Send),
    // not at response time when it actually matters.
    const userId = request.cookies.get("session")?.value?.split(".")[0] || "default";
    const preview = response.length > 100 ? response.slice(0, 100) + "..." : response;

    try {
      await sendPushNotification(userId, {
        type: "chat_response",
        title: "Bar Manager — Chat Reply",
        body: preview,
        url: "/chat",
        tag: "chat-response",
      });
    } catch (err) {
      console.error("Chat push notification failed:", err);
    }

    return NextResponse.json({ response, usage });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { error: "AI request failed", details: String(error) },
      { status: 500 }
    );
  }
}
