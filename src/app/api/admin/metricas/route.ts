import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin } from "@/lib/admin-guard";
import { carregarFinanceiro } from "@/lib/admin-financeiro";
import { contratoIdsDoEscopoAtual } from "@/lib/admin-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Metricas financeiras + lista de parcelas para o painel admin. Toda a logica
// de query e agregacao vive em carregarFinanceiro (server-only); aqui so
// checamos a sessao e devolvemos o JSON. Autenticacao: SESSAO de admin.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("financeiro.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }

  try {
    // Escopo por tenant: admin nao-global ve apenas os numeros dos seus contratos.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const contratoIds = await contratoIdsDoEscopoAtual(supabase);
    const dados = await carregarFinanceiro(contratoIds);
    return NextResponse.json({ ok: true, ...dados });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, erro: err?.message || "Falha ao carregar dados financeiros." },
      { status: 500 }
    );
  }
}
