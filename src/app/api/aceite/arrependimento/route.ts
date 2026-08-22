import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { dentroDoPrazoArrependimento } from "@/lib/termos";
import { enviarAvisoInternoEmail } from "@/lib/email";
import { abrirCancelamentoTitular } from "@/lib/e4-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exercício do direito de arrependimento (CDC art. 49) pelo cliente: se ainda
// está dentro dos 7 dias do aceite da versão vigente, registra `arrependido_em`
// e avisa a equipe. NÃO cancela contrato/cobrança automaticamente — isso é um
// processo operacional (a equipe é notificada para tratar).
export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const titularId = verificarSessao(token)?.titularId ?? null;
  if (!titularId) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const { data: termo } = await supabase
    .from("termos")
    .select("id, versao")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!termo) {
    return NextResponse.json({ ok: false, error: "Nenhum termo vigente." }, { status: 400 });
  }

  const { data: aceite } = await supabase
    .from("aceites")
    .select("id, data_hora, arrependido_em")
    .eq("titular_id", titularId)
    .eq("termo_id", termo.id)
    .maybeSingle();
  if (!aceite) {
    return NextResponse.json({ ok: false, error: "Nenhum aceite para desistir." }, { status: 400 });
  }
  if (aceite.arrependido_em) {
    // Ja arrependido: ainda assim (re)garante o E4 aberto. Se a abertura falhou
    // numa tentativa anterior, este re-clique do cliente e o caminho de
    // recuperacao (idempotente: excecao_ja_aberta = sucesso).
    try {
      await abrirCancelamentoTitular({
        titularId,
        origem: "portal_arrependimento",
        motivo: `Arrependimento (CDC art. 49) — Termo versão ${termo.versao}`,
        autor: "cliente:arrependimento",
      });
    } catch (err) {
      console.error("[arrependimento] falha ao (re)abrir o processo E4");
      void err;
    }
    return NextResponse.json({ ok: true, jaArrependido: true });
  }
  if (!dentroDoPrazoArrependimento(aceite.data_hora, new Date().toISOString())) {
    return NextResponse.json(
      { ok: false, error: "O prazo de arrependimento (7 dias) já expirou." },
      { status: 400 }
    );
  }

  const agora = new Date().toISOString();
  const { error } = await supabase.from("aceites").update({ arrependido_em: agora }).eq("id", aceite.id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao registrar o arrependimento." }, { status: 500 });
  }

  // Abre o processo E4 (doc 01 §4): pausa a régua de cobrança/lembretes e cai na
  // Fila do Dia (roteado ao Consultor, para a conversa de retenção antes do
  // acerto). Best-effort: não desfaz o arrependimento já registrado. NÃO cancela
  // nem reembolsa — isso é execução humana / motor de acerto (marco próprio).
  try {
    await abrirCancelamentoTitular({
      titularId,
      origem: "portal_arrependimento",
      motivo: `Arrependimento (CDC art. 49) exercido no portal — Termo versão ${termo.versao}`,
      autor: "cliente:arrependimento",
    });
  } catch (err) {
    console.error("[arrependimento] falha ao abrir o processo E4");
    void err;
  }

  // Avisa a equipe (best-effort): alguém precisa tratar o contrato/cobrança.
  try {
    const { data: titular } = await supabase
      .from("titulares")
      .select("nome_completo, cpf, email")
      .eq("id", titularId)
      .maybeSingle();
    await enviarAvisoInternoEmail(
      "Arrependimento exercido (Termo de Adesao) - EXP Tour",
      `O cliente ${titular?.nome_completo || "(sem nome)"} (CPF ${titular?.cpf || "?"}, ${titular?.email || "sem e-mail"}) ` +
        `exerceu o direito de arrependimento do Termo de Adesao (versao ${termo.versao}) em ${agora}.\n` +
        `Titular id: ${titularId}. Tratar contrato/cobranca conforme o processo.`
    );
  } catch (err) {
    console.error("Falha ao avisar a equipe sobre o arrependimento:", err);
  }

  return NextResponse.json({ ok: true, arrependidoEm: agora });
}
