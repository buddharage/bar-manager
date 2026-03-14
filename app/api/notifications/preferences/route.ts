import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";

function getUserId(request: NextRequest): string {
  return request.cookies.get("session")?.value?.split(".")[0] || "default";
}

export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getUserId(request);
  const supabase = createServerClient();

  const { data } = await supabase
    .from("notification_preferences")
    .select("inventory_alerts, chat_responses")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json(data || { inventory_alerts: true, chat_responses: true });
}

export async function PUT(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getUserId(request);
  const body = await request.json();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        inventory_alerts: body.inventory_alerts ?? true,
        chat_responses: body.chat_responses ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
