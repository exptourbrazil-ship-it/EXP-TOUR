import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { TIPOS_CANCELAMENTO, type TipoCancelamento } from "@/lib/cancelamento";

export const runtime = "nodejs";

// Cancelamento de contrato pelo admin.
//
// Por que existe: o portal nao tinha como representar um contrato cancelado.
// Nao havia coluna de status, nao havia rota, e a rota de arrependimento do
// cliente (/api/aceite/arrependimento) apenas registra o ato e avisa a equipe —
// ela nao cancela nada, por design. Consequencia pratica: um cliente que
// desistia continuava recebendo lembrete de cobranca e de quitacao pela regua
// automatica.
//
// O cancelamento e SOFT: o contrato e as parcelas continuam no banco, com
// data, tipo, motivo e autor registrados. Apagar o contrato apagaria as
// parcelas em cascata e destruiria o historico de quanto era e por que acabou.
// Tambem e reversivel — ver DELETE abaixo.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}) as any);

  const tipo = String(body?.tipo || "") as TipoCancelamento;
  if (!TIPOS_CANCELAMENTO.some((t) => t.valor === tipo)) {
    return NextResponse.json({ ok: false, erro: "Informe um tipo de cancelamento valido." }, { status: 400 });
  }

  const motivo = String(body?.motivo || "").trim();
  if (motivo.length < 3) {
    return NextResponse.json(
      { ok: false, erro: "Descreva o motivo (minimo 3 caracteres)." },
      { status: 400 }
    );
  }

  // Data efetiva opcional: o cancelamento costuma ser comunicado por WhatsApp
  // ou e-mail dias antes de alguem registrar no sistema. Gravar "hoje" nesses
  // casos falsearia a data que importa — inclusive para a contagem dos 7 dias
  // do direito de arrependimento. Aceitamos a data real, nunca no futuro.
  const agora = new Date();
  let efetivaISO = agora.toISOString();
  if (body?.dataEfetiva) {
    const d = new Date(String(body.dataEfetiva));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, erro: "dataEfetiva invalida." }, { status: 400 });
    }
    if (d.getTime() > agora.getTime()) {
      return NextResponse.json({ ok: false, erro: "dataEfetiva nao pode ser no futuro." }, { status: 400 });
    }
    efetivaISO = d.toISOString();
  }

  const supabase = getSupabase();
  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";

  const { data: contrato, error: selErr } = await supabase
    .from("contratos")
    .select("id, nome, cancelado_em, titular_id")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    console.error("[cancelar-contrato] falha ao ler contrato:", selErr.message);
    return NextResponse.json({ ok: false, erro: "Falha ao ler o contrato." }, { status: 500 });
  }
  if (!contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato nao encontrado." }, { status: 404 });
  }
  if (contrato.cancelado_em) {
    return NextResponse.json({ ok: true, jaCancelado: true, canceladoEm: contrato.cancelado_em });
  }

  const { error } = await supabase
    .from("contratos")
    .update({
      cancelado_em: efetivaISO,
      cancelado_tipo: tipo,
      cancelado_motivo: motivo,
      cancelado_por: usuario,
    })
    .eq("id", id);

  if (error) {
    console.error("[cancelar-contrato] falha ao gravar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao cancelar o contrato." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "contrato.cancelar",
    alvo: id,
    detalhe: { tipo, motivo, dataEfetiva: efetivaISO, contrato: contrato.nome },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, canceladoEm: efetivaISO });
}

// Reativa um contrato cancelado. Cancelamento por engano acontece, e a
// alternativa seria mexer no banco na mao.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabase();
  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";

  const { error } = await supabase
    .from("contratos")
    .update({ cancelado_em: null, cancelado_tipo: null, cancelado_motivo: null, cancelado_por: null })
    .eq("id", id);

  if (error) {
    console.error("[cancelar-contrato] falha ao reativar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao reativar o contrato." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "contrato.reativar",
    alvo: id,
    detalhe: {},
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
