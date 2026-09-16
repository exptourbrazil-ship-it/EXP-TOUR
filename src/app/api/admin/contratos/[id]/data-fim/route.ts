import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarContratoForaDoEscopo } from "@/lib/admin-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Valida uma data de calendário REAL (não só o formato). Date.parse aceita
// "2026-02-30" por roll-over — aqui remontamos em UTC e conferimos os componentes.
function ehDataCalendarioValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// POST: define/limpa a data de TÉRMINO do programa (contratos.data_fim). Alimenta
// hoje a verificação de retaguarda de Seguro (vigência cobrindo o período); fica
// disponível para a checagem de Passagens (volta vs. fim) quando ela consumir o
// campo. Gate casos.gerir por SESSÃO (usuário identificado),
// escopo por tenant (barrarContratoForaDoEscopo), auditado. Body: { dataFim:
// "AAAA-MM-DD" | null }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  const usuario = await usuarioAdminAtual();
  if (!usuario) return NextResponse.json({ ok: false, error: "Sessão sem usuário" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  const raw = body?.dataFim;

  let dataFim: string | null;
  if (raw === null || raw === "" || raw === undefined) {
    dataFim = null;
  } else if (typeof raw === "string" && ehDataCalendarioValida(raw)) {
    dataFim = raw;
  } else {
    return NextResponse.json(
      { ok: false, error: "Data inválida. Use o formato AAAA-MM-DD (data real) ou vazio para limpar." },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const barrado = await barrarContratoForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, data_inicio, data_fim")
    .eq("id", id)
    .maybeSingle();
  if (!contrato) {
    return NextResponse.json({ ok: false, error: "Contrato não encontrado." }, { status: 404 });
  }

  // Coerência: o término não pode ser anterior ao início. Além de dado
  // incoerente, um data_fim < data_inicio rebaixaria a referência da vigência de
  // Seguro e engoliria um alerta legítimo (a retaguarda tem fail-safe, mas não
  // persistimos o dado inconsistente).
  const dataInicio = ((contrato as { data_inicio?: string | null }).data_inicio ?? "").slice(0, 10);
  if (dataFim && dataInicio && dataFim < dataInicio) {
    return NextResponse.json(
      { ok: false, error: "A data de término não pode ser anterior à data de início do contrato." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("contratos").update({ data_fim: dataFim }).eq("id", id);
  if (error) {
    console.error("[contratos/data-fim] update falhou:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao salvar a data de término." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "contrato.data_fim.definir",
    alvo: id,
    detalhe: {
      data_fim_anterior: (contrato as { data_fim?: string | null }).data_fim ?? null,
      data_fim_nova: dataFim,
    },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, data_fim: dataFim });
}
