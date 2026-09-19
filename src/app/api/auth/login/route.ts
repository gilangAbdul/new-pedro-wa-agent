import { NextRequest, NextResponse } from "next/server";
import { createSessionCookieValue } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();

  if (!pin || pin !== process.env.ACCESS_PIN) {
    return NextResponse.json({ error: "PIN salah" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("pedro_auth", createSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 hari
    path: "/",
  });

  return response;
}