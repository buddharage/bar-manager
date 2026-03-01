import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";

/**
 * GET /api/gift-cards/:id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("gift_cards")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ gift_card: data });
}

/**
 * PATCH /api/gift-cards/:id
 *
 * Update a gift card's fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = createServerClient();

  const allowedFields: Record<string, unknown> = {};

  if (body.card_id !== undefined) allowedFields.card_id = body.card_id;
  if (body.beginning_balance !== undefined) {
    allowedFields.beginning_balance = Number(body.beginning_balance);
  }
  if (body.current_balance !== undefined) {
    allowedFields.current_balance = Number(body.current_balance);
  }
  if (body.status !== undefined) allowedFields.status = body.status;
  if (body.issued_date !== undefined) {
    allowedFields.issued_date = body.issued_date || null;
  }
  if (body.last_used_date !== undefined) {
    allowedFields.last_used_date = body.last_used_date || null;
  }
  if (body.purchaser_name !== undefined) {
    allowedFields.purchaser_name = body.purchaser_name || null;
  }
  if (body.recipient_name !== undefined) {
    allowedFields.recipient_name = body.recipient_name || null;
  }
  if (body.notes !== undefined) {
    allowedFields.notes = body.notes || null;
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  allowedFields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("gift_cards")
    .update(allowedFields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gift_card: data });
}

/**
 * DELETE /api/gift-cards/:id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from("gift_cards")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
