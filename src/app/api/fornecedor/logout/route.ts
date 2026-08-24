import { NextResponse } from "next/server";
import { FORNECEDOR_SESSION_COOKIE } from "@/lib/fornecedor-session";

export const runtime = "nodejs";

// Encerra a sessao do fornecedor removendo o cookie httpOnly.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(FORNECEDOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
