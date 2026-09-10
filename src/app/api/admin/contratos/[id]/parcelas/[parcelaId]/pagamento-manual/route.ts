import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import {
  registrarPagamentoManual,
  estornarPagamentoManual,
  PagamentoManualBloqueado,
} from "@/lib/pagamento-manual-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Traduz o codigo de bloqueio (motor/SQL) numa mensagem ao admin.
function mensagemMotivo(codigo: string): string {
  switch (codigo) {
    case "contrato_nao_encontrado":
      return "Contrato não encontrado.";
    case "parcela_nao_encontrada":
      return "Parcela não encontrada neste contrato.";
    case "parcela_ja_paga":
      return "Esta parcela já está paga.";
    case "parcela_em_disputa":
      return "Esta parcela está em disputa e não pode receber baixa manual.";
    case "parcela_com_cobranca_em_voo":
      return "Esta parcela tem uma cobrança Pix ativa. Cancele o Pix antes de registrar o pagamento manual.";
    case "parcela_nao_paga":
      return "Esta parcela não está paga — não há baixa manual para estornar.";
    case "nao_e_pagamento_manual":
      return "Esta parcela foi paga pelo Pix (Mercado Pago) — o estorno manual não se aplica.";
    case "valor_brl_invalido":
      return "Informe um valor em reais (BRL) maior que zero.";
    case "valor_programa_invalido":
      return "Informe o valor na moeda do programa maior que zero.";
    case "data_no_futuro":
      return "A data do pagamento não pode ser no futuro.";
    case "data_invalida":
      return "Informe uma data de pagamento válida.";
    case "referencia_invalida":
    case "dados_invalidos":
      return "Dados inválidos.";
    default:
      return "Não foi possível concluir a operação.";
  }
}

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// POST — registra a baixa MANUAL de uma parcela (pagamento recebido por fora do
// Pix). Mexe em dinheiro: exige capacidade financeiro.gerir. Auditado.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; parcelaId: string }> },
) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id: contratoId, parcelaId } = await params;
  if (!contratoId || !parcelaId) {
    return NextResponse.json({ ok: false, erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    valorBRL?: unknown;
    valorPrograma?: unknown;
    pagoEm?: unknown;
    forma?: unknown;
    observacao?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  const valorBRL = Number(body.valorBRL);
  const valorPrograma = Number(body.valorPrograma);
  const pagoEm = typeof body.pagoEm === "string" && body.pagoEm ? body.pagoEm.slice(0, 10) : "";
  const forma = typeof body.forma === "string" ? body.forma.slice(0, 40) : null;
  const observacao = typeof body.observacao === "string" ? body.observacao.slice(0, 500) : null;

  // Guarda-corpo de data no futuro tratado aqui (o SQL nao conhece "hoje" do BR).
  const hojeISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (!pagoEm || pagoEm.length < 10) {
    return NextResponse.json({ ok: false, erro: mensagemMotivo("data_invalida") }, { status: 400 });
  }
  if (pagoEm > hojeISO) {
    return NextResponse.json({ ok: false, erro: mensagemMotivo("data_no_futuro") }, { status: 400 });
  }

  try {
    const r = await registrarPagamentoManual({
      supabase: supa(),
      contratoId,
      parcelaId,
      valorBRL,
      valorPrograma,
      pagoEm,
      forma,
      observacao,
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof PagamentoManualBloqueado) {
      const status = err.codigo.startsWith("falha_") ? 500 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagemMotivo(err.codigo) }, { status });
    }
    console.error("[pagamento-manual] erro inesperado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao registrar o pagamento." }, { status: 500 });
  }
}

// DELETE — estorna a baixa manual de uma parcela (lancada errada). So reverte
// pagamentos manuais; nunca toca um pagamento do Mercado Pago. Auditado.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; parcelaId: string }> },
) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id: contratoId, parcelaId } = await params;
  if (!contratoId || !parcelaId) {
    return NextResponse.json({ ok: false, erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { motivo?: unknown } | null;
  const motivo = body && typeof body.motivo === "string" ? body.motivo.slice(0, 500) : null;

  try {
    const r = await estornarPagamentoManual({
      supabase: supa(),
      contratoId,
      parcelaId,
      motivo,
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof PagamentoManualBloqueado) {
      const status = err.codigo.startsWith("falha_") ? 500 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagemMotivo(err.codigo) }, { status });
    }
    console.error("[pagamento-manual] erro inesperado (estorno):", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao estornar o pagamento." }, { status: 500 });
  }
}
