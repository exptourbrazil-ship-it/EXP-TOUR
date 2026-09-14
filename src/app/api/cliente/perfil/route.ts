import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarPerfilTitular } from "@/lib/perfil-service";
import { podeCliente } from "@/lib/perfil-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Perfil de acesso do titular logado, para a UI decidir o que MOSTRAR (ex.: a
// aba Financeiro no menu). É só cosmético — o enforcement de verdade é
// server-authoritative nas páginas/rotas. Devolve o perfil + os flags que a
// navegação usa.
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const sessao = verificarSessao(token);
  if (!sessao) return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const perfil = await carregarPerfilTitular(supabase, sessao.titularId);
  return NextResponse.json({
    ok: true,
    perfil,
    financeiro: podeCliente(perfil, "financeiro.ver"),
  });
}
