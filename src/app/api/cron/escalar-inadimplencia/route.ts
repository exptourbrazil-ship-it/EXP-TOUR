import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { diasDeAtraso } from "@/lib/fila-do-dia";
import { contratoCancelado } from "@/lib/cancelamento";
import { contratosComSuspensao } from "@/lib/excecao";
import { INADIMPLENCIA_DIAS_PADRAO, elegivelInadimplencia } from "@/lib/inadimplencia";
import { escalarInadimplenciaContrato } from "@/lib/inadimplencia-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escalada por inadimplencia (processo E5, doc 01 §4). Uma vez por dia, encontra
// as parcelas nao pagas vencidas ha >= D+30 (config) em contratos NAO cancelados
// e SEM excecao ativa suspendendo cobranca (contrato ja em processo — E1/E4/E6/
// E8 ou o proprio E5 — nao reescala), e abre o E5: pausa a regua e cria a tarefa
// ao Financeiro para enviar a notificacao formal de rescisao com prazo de cura.
// NAO envia a notificacao nem rescinde (peso legal / motor de acerto = humano).
//
// Idempotente: E5 e aberta no maximo uma vez por contrato (indice unico parcial).

const LIMITE_POR_EXECUCAO = 500;

// Limiar de dias, validado: uma env malformada (nao-numerica -> NaN, ou "0" que
// escalaria tudo vencido ha >=0 dias) cai para o default em vez de quebrar o
// cron ou escalar indevidamente.
function resolverDias(): number {
  const bruto = Number(process.env.INADIMPLENCIA_DIAS);
  if (Number.isFinite(bruto) && bruto > 0) return bruto;
  if (process.env.INADIMPLENCIA_DIAS) {
    console.error(
      `[escalar-inadimplencia] INADIMPLENCIA_DIAS invalido (${process.env.INADIMPLENCIA_DIAS}); usando default ${INADIMPLENCIA_DIAS_PADRAO}.`
    );
  }
  return INADIMPLENCIA_DIAS_PADRAO;
}
const DIAS = resolverDias();

function isoMenosDias(base: Date, dias: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function nomeDe(rel: unknown): string | null {
  if (!rel) return null;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  return (obj as { nome_completo?: string } | undefined)?.nome_completo || null;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);
  const cutoffISO = isoMenosDias(hoje, DIAS); // vencimento <= cutoff => D+DIAS ou mais

  const { data: parcelas, error } = await supabase
    .from("parcelas")
    .select(
      "id, contrato_id, vencimento, status, contrato:contratos(cancelado_em, titular_id, titular:titulares(nome_completo))"
    )
    .neq("status", "pago")
    .is("paid_at", null)
    .lte("vencimento", cutoffISO)
    .order("vencimento", { ascending: true })
    .limit(LIMITE_POR_EXECUCAO);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler parcelas: " + error.message }, { status: 500 });
  }

  // Teto atingido: provavel truncamento (o .limit incide sobre PARCELAS, nao
  // contratos). As excedentes reescalam no proximo dia (ordenadas por vencimento
  // asc, os mais antigos primeiro), mas registramos para dar visibilidade em vez
  // de cortar em silencio.
  const truncado = (parcelas?.length ?? 0) >= LIMITE_POR_EXECUCAO;
  if (truncado) {
    console.warn(
      `[escalar-inadimplencia] teto de ${LIMITE_POR_EXECUCAO} parcelas atingido; parcelas alem do teto ficam para o proximo dia.`
    );
  }

  // Suspensao por excecao: contrato ja em processo que suspende cobranca (E1/E4/
  // E6/E8/E5) NAO reescala. Falha FECHADA: sem essa lista nao da para saber quem
  // ja esta em processo — melhor abortar do que reescalar indevidamente.
  const { data: excecoesAtivas, error: erroExc } = await supabase
    .from("case_exceptions")
    .select("contrato_id, status, suspende")
    .in("status", ["aberta", "em_andamento"]);
  if (erroExc) {
    console.error("[escalar-inadimplencia] falha ao ler excecoes; execucao abortada:", erroExc.message);
    return NextResponse.json({ ok: false, erro: "Falha ao ler suspensoes; abortado" }, { status: 500 });
  }
  const suspensos = contratosComSuspensao((excecoesAtivas || []) as any[], ["cobranca", "lembretes"]);

  // Agrupa por contrato: uma escalada por contrato, com a maior idade vencida.
  type Info = { titularId: string; contexto: string | null; diasVencida: number };
  const porContrato = new Map<string, Info>();
  for (const p of parcelas || []) {
    const contrato = (p as any).contrato;
    if (!contrato || contratoCancelado(contrato)) continue;
    if (suspensos.has((p as any).contrato_id)) continue;
    const dias = diasDeAtraso((p as any).vencimento, hojeISO);
    if (!elegivelInadimplencia(dias, DIAS)) continue;
    const atual = porContrato.get((p as any).contrato_id);
    if (!atual || dias > atual.diasVencida) {
      porContrato.set((p as any).contrato_id, {
        titularId: contrato.titular_id,
        contexto: nomeDe(contrato.titular),
        diasVencida: dias,
      });
    }
  }

  const resumo = { candidatos: porContrato.size, escaladas: 0, ja_abertas: 0, erros: 0 };
  for (const [contratoId, info] of porContrato) {
    try {
      const r = await escalarInadimplenciaContrato(supabase, {
        contratoId,
        titularId: info.titularId,
        contexto: info.contexto,
        diasVencida: info.diasVencida,
      });
      if (r.aberta) resumo.escaladas++;
      else resumo.ja_abertas++;
    } catch {
      resumo.erros++;
      console.error("[escalar-inadimplencia] falha ao escalar um contrato");
    }
  }

  return NextResponse.json({ ok: true, data: hojeISO, limiarDias: DIAS, truncado, ...resumo });
}
