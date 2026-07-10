import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Encerra a sessao do titular, removendo o cookie de autenticacao.
export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
}
