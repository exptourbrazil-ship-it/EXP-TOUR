import { NextResponse } from "next/server";
import { checarCapacidadeRequest } from "@/lib/admin-guard";
import { verificarConexaoZoho } from "@/lib/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Autoteste da conexao com o Zoho: informa quais variaveis de ambiente estao
// presentes (sem revelar os valores) e tenta renovar o access token. Serve
// para a equipe validar a configuracao OAuth apos preencher os segredos no
// ambiente (Vercel). Nao recebe nem grava credenciais.
export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  // Presenca (booleana) das variaveis — nunca os valores.
  const envs = {
    ZOHO_CLIENT_ID: !!process.env.ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET: !!process.env.ZOHO_CLIENT_SECRET,
    ZOHO_REFRESH_TOKEN: !!process.env.ZOHO_REFRESH_TOKEN,
    ZOHO_TOKEN_RESPONSE: !!process.env.ZOHO_TOKEN_RESPONSE,
    ZOHO_API_DOMAIN: process.env.ZOHO_API_DOMAIN || "(padrão) https://www.zohoapis.com",
  };

  const conexao = await verificarConexaoZoho();

  return NextResponse.json({ ok: conexao.ok, conexao, envs });
}
