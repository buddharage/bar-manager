import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";

/**
 * GET /api/gift-cards
 *
 * Returns all gift cards, ordered by most recently created.
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("gift_cards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gift_cards: data });
}

/**
 * POST /api/gift-cards
 *
 * Create a new gift card.
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createServerClient();

  if (!body.card_id || body.beginning_balance === undefined) {
    return NextResponse.json(
      { error: "card_id and beginning_balance are required" },
      { status: 400 },
    );
  }

  const record: Record<string, unknown> = {
    card_id: body.card_id,
    beginning_balance: Number(body.beginning_balance),
    current_balance: body.current_balance !== undefined
      ? Number(body.current_balance)
      : Number(body.beginning_balance),
    status: body.status || "active",
  };

  if (body.issued_date) record.issued_date = body.issued_date;
  if (body.last_used_date) record.last_used_date = body.last_used_date;
  if (body.purchaser_name) record.purchaser_name = body.purchaser_name;
  if (body.recipient_name) record.recipient_name = body.recipient_name;
  if (body.notes) record.notes = body.notes;

  const { data, error } = await supabase
    .from("gift_cards")
    .insert(record)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gift_card: data }, { status: 201 });
}
