import { NextRequest, NextResponse } from "next/server";
import { createToken, cookieOptions } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createToken();
  const response = NextResponse.json({ success: true });
  const opts = cookieOptions();
  response.cookies.set(opts.name, token, opts);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  const opts = cookieOptions(true);
  response.cookies.set(opts.name, "", opts);
  return response;
}
