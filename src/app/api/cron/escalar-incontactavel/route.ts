import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { abrirIncontactavelTitular } from "@/lib/e11-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escalada de cliente INCONTACTAVEL (processo E11, doc 01 §4). Uma vez por dia,
// encontra documentos REJEITADOS que o cliente NAO reenviou ha >= N dias (config,
// default 30) — pendencia parada mesmo apos o aviso de rejeicao — e abre o E11
// nos contratos ativos do titular (escalada a humano). NAO cobra, cancela nem
// notifica o cliente. Idempotente (E11 unica por contrato).
//
// Nao duplica o E5: aqui o sinal e documental (nao-pagamento).

const LIMITE_POR_EXECUCAO = 500;
const INCONTACTAVEL_DIAS_PADRAO = 30;

function resolverDias(): number {
  const bruto = Number(process.env.INCONTACTAVEL_DIAS);
  if (Number.isFinite(bruto) && bruto > 0) return bruto;
  if (process.env.INCONTACTAVEL_DIAS) {
    console.error(
      `[escalar-incontactavel] INCONTACTAVEL_DIAS invalido (${process.env.INCONTACTAVEL_DIAS}); usando default ${INCONTACTAVEL_DIAS_PADRAO}.`
    );
  }
  return INCONTACTAVEL_DIAS_PADRAO;
}
const DIAS = resolverDias();

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

  const cutoffISO = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();

  // Documentos rejeitados ha >= DIAS e ainda rejeitados (nao reenviados).
  const { data: docs, error } = await supabase
    .from("documentos")
    .select("titular_id, rejeitado_em")
    .eq("status", "rejeitado")
    .not("rejeitado_em", "is", null)
    .lte("rejeitado_em", cutoffISO)
    .limit(LIMITE_POR_EXECUCAO);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler documentos: " + error.message }, { status: 500 });
  }

  const truncado = (docs?.length ?? 0) >= LIMITE_POR_EXECUCAO;

  // Um titular pode ter varios documentos parados — escala uma vez por titular.
  const titulares = Array.from(
    new Set((docs || []).map((d) => (d as { titular_id?: string }).titular_id).filter(Boolean) as string[])
  );

  const resumo = { candidatos: titulares.length, escaladas: 0, ja_abertas: 0, erros: 0, truncado };
  for (const titularId of titulares) {
    try {
      const r = await abrirIncontactavelTitular({
        titularId,
        motivo: `Documento rejeitado nao reenviado ha >= ${DIAS} dias.`,
      });
      resumo.escaladas += r.abertas;
      resumo.ja_abertas += Math.max(0, r.contratosAtivos - r.abertas);
    } catch {
      resumo.erros++;
      console.error("[escalar-incontactavel] falha ao escalar um titular");
    }
  }

  return NextResponse.json({ ok: true, limiarDias: DIAS, ...resumo });
}
