import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { obterIp } from "@/lib/rate-limit";
import { estadoProposta } from "@/lib/propostas";
import { dataLimiteQuitacao } from "@/lib/parcelas";
import { prazoArrependimentoISO } from "@/lib/termos";
import { enviarBoasVindasEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Assinatura da proposta (Cláusula 2.5.c / 17.1): marcação eletrônica que
// CELEBRA o contrato. Pública — o token do link autoriza. Efeito
// (provisionamento): cria/reusa o titular por CPF, cria o contrato + a parcela
// inicial, registra o aceite (data/hora/IP/UA/sessão/versão/hash) e dispara o
// e-mail de boas-vindas. Inicia os 7 dias de arrependimento.

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function maisDias(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
function fmtData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const { data: prop } = await supabase
    .from("propostas")
    .select("id, status, nome_completo, cpf, email, telefone, programa_nome, estudante_nome, pais_destino, moeda, custo_programa, data_inicio, validade")
    .eq("token", token)
    .maybeSingle();
  if (!prop) {
    return NextResponse.json({ ok: false, erro: "Proposta não encontrada." }, { status: 404 });
  }

  const estado = estadoProposta(prop as any, hojeBrasilISO());
  if (estado === "aceita") {
    return NextResponse.json({ ok: true, jaAceita: true });
  }
  if (estado !== "valida") {
    return NextResponse.json({ ok: false, erro: "Esta proposta não está mais disponível para assinatura." }, { status: 400 });
  }

  const cpf = (prop.cpf || "").replace(/\D/g, "");
  if (!cpf || !prop.moeda || prop.custo_programa == null) {
    return NextResponse.json({ ok: false, erro: "Proposta incompleta (CPF, moeda e custo são obrigatórios)." }, { status: 400 });
  }

  const { data: termo } = await supabase
    .from("termos")
    .select("id, versao, hash")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!termo) {
    return NextResponse.json({ ok: false, erro: "Condições Gerais (Termo) não configuradas. Fale com a EXP Tour." }, { status: 400 });
  }

  // "Claim" idempotente: só provisiona quem conseguir virar o status de
  // 'enviada' para 'aceita'. Uma segunda tentativa não duplica.
  const agora = new Date().toISOString();
  const { data: claim } = await supabase
    .from("propostas")
    .update({ status: "aceita", aceito_em: agora, atualizado_em: agora })
    .eq("id", prop.id)
    .eq("status", "enviada")
    .select("id");
  if (!claim || claim.length === 0) {
    return NextResponse.json({ ok: true, jaAceita: true });
  }

  // Titular: cria por CPF ou reusa o existente.
  let titularId: string | null = null;
  const { data: titularExistente } = await supabase.from("titulares").select("id").eq("cpf", cpf).maybeSingle();
  if (titularExistente) {
    titularId = titularExistente.id;
  } else {
    const { data: novoT, error: eT } = await supabase
      .from("titulares")
      .insert({ nome_completo: prop.nome_completo || "Contratante", cpf, email: prop.email || null, telefone: prop.telefone || null, data_inicio: prop.data_inicio || null })
      .select("id")
      .single();
    if (eT || !novoT) {
      return NextResponse.json({ ok: false, erro: "Falha ao criar o titular." }, { status: 500 });
    }
    titularId = novoT.id;
  }

  // Contrato.
  const { data: contrato, error: eC } = await supabase
    .from("contratos")
    .insert({
      titular_id: titularId,
      nome: prop.programa_nome || "Programa",
      valor_total: prop.custo_programa,
      moeda: prop.moeda,
      estudante_nome: prop.estudante_nome || null,
      pais_destino: prop.pais_destino || null,
      data_inicio: prop.data_inicio || null,
    })
    .select("id")
    .single();
  if (eC || !contrato) {
    return NextResponse.json({ ok: false, erro: "Falha ao criar o contrato." }, { status: 500 });
  }

  // Parcela inicial: saldo total, vencimento na data-limite de quitação (D-30
  // do início) ou, sem início, em 30 dias. O cliente ajusta depois.
  const venc = dataLimiteQuitacao(prop.data_inicio) || maisDias(hojeBrasilISO(), 30);
  await supabase.from("parcelas").insert({
    contrato_id: contrato.id,
    numero: 1,
    descricao: "Saldo do programa",
    valor_original: prop.custo_programa,
    valor_atual: prop.custo_programa,
    vencimento: venc,
    is_entrada: false,
    status: "pendente",
  });

  // Registro do aceite (marcação eletrônica) — prova da manifestação de vontade.
  await supabase.from("aceites").insert({
    titular_id: titularId,
    proposta_id: prop.id,
    termo_id: termo.id,
    versao: termo.versao,
    hash_conteudo: termo.hash,
    contexto: "checkout",
    ip: obterIp(request),
    user_agent: request.headers.get("user-agent") || null,
    sessao_id: crypto.randomUUID(),
  });

  // Liga o contrato à proposta.
  await supabase.from("propostas").update({ contrato_id: contrato.id, atualizado_em: new Date().toISOString() }).eq("id", prop.id);

  // Boas-vindas (best-effort).
  try {
    if (prop.email) {
      const arrependimentoAte = fmtData(prazoArrependimentoISO(agora));
      await enviarBoasVindasEmail(prop.email, prop.nome_completo || "", {
        portalUrl: process.env.NEXT_PUBLIC_APP_URL || null,
        arrependimentoAte,
      });
    }
  } catch (err) {
    console.error("Falha ao enviar boas-vindas:", err);
  }

  return NextResponse.json({ ok: true });
}
