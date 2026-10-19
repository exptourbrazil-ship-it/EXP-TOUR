import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerConfere } from "@/lib/segredo";
import { createClient } from "@supabase/supabase-js";
import { resolverEscopoTenant, titularIdsDoTenant, contratoIdsDoTenant, emLotes } from "@/lib/cron-tenant";
import { enviarSolicitacaoPassaporteEmail } from "@/lib/email";
import { estadoDoContrato } from "@/lib/contrato-estado-service";
import { rankEstado, estadoValido } from "@/lib/contrato-estados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron diário: pede ao TITULAR o upload da IMAGEM do passaporte (páginas com foto
// e dados pessoais) quando há um CLIENTE ATIVO (contrato não cancelado, cujo estado
// DERIVADO está entre entrada_paga e retorno — exclui proposta ainda não paga,
// proposta expirada, cancelado e concluído) e o titular NÃO tem nenhum documento
// 'passaporte' no acervo. O estado é derivado (estadoDoContrato), não lido da coluna
// crua, porque contratos vindos do CRM têm contratos.estado NULL e o estado
// proposta_expirada é puramente derivado — ler a coluna crua incluiria prospects.
//
// UMA vez por CLIENTE (titular): a chave de idempotência é `lembrete_passaporte:
// <titular_id>` — o acervo de documentos também é por titular, então um titular com
// mais de um contrato em andamento recebe um único lembrete (citando o estudante do
// primeiro contrato). Idempotência robusta via ledger `events` (claim atômico
// `pendente` → envia → `processado`, com retry; e-mail nunca se perde nem duplica).
// Falha FECHADA: sem CRON_SECRET, recusa.

const PENDENTE_OBSOLETO_MS = 60 * 60 * 1000; // 1h

// Cliente ATIVO = estado derivado na linha principal entre entrada_paga (1) e
// retorno (8). Exclui proposta_enviada (0, ainda não pagou), concluido (9) e os
// terminais fora da linha (proposta_expirada / cancelado, rank null).
const RANK_MIN_CLIENTE = rankEstado("entrada_paga") as number; // 1
const RANK_CONCLUIDO = rankEstado("concluido") as number; // 9
function clienteAtivo(estado: string | null): boolean {
  if (!estado || !estadoValido(estado)) return false;
  const r = rankEstado(estado);
  return r != null && r >= RANK_MIN_CLIENTE && r < RANK_CONCLUIDO;
}

function ehConflitoUnicidade(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Promove o claim `pendente` -> `processado` (e-mail confirmado). Insiste (até 3x)
// para não deixar um claim `pendente` que reabriria o envio depois de
// PENDENTE_OBSOLETO_MS. Retorna true se marcou; false se não confirmou.
async function marcarEnviado(supabase: SupabaseClient, chave: string): Promise<boolean> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { error } = await supabase
      .from("events")
      .update({ status: "processado", processed_at: new Date().toISOString() })
      .eq("idempotency_key", chave);
    if (!error) return true;
    console.error(`[lembrar-passaporte] falha ao marcar enviado (tentativa ${tentativa + 1}):`, error.message);
  }
  return false;
}

// Reivindica a chave ATOMICAMENTE (status `pendente`). Decide se ESTA execução deve
// enviar: sem claim -> "enviar"; conflito 23505 com status `processado` -> "pular";
// `pendente` recente (irmão concorrente) -> "pular"; `pendente` antigo (execução que
// caiu antes de confirmar) -> "enviar"; erro transitório -> "erro".
async function reivindicarEnvio(
  supabase: SupabaseClient,
  chave: string,
  externalId: string,
  payload: Record<string, unknown>,
): Promise<"enviar" | "pular" | "erro"> {
  const { error: claimErro } = await supabase.from("events").insert({
    source: "lembrete_passaporte",
    event_type: "solicitacao_passaporte",
    idempotency_key: chave,
    external_id: externalId,
    payload,
    status: "pendente",
  });
  if (!claimErro) return "enviar";
  if (ehConflitoUnicidade(claimErro as { code?: string })) {
    const { data: ex, error: exErro } = await supabase
      .from("events")
      .select("status, created_at")
      .eq("idempotency_key", chave)
      .maybeSingle();
    if (exErro) return "erro";
    if (ex?.status === "processado") return "pular";
    const idadeMs = ex?.created_at ? Date.now() - new Date(ex.created_at).getTime() : Infinity;
    return idadeMs >= PENDENTE_OBSOLETO_MS ? "enviar" : "pular";
  }
  return "erro";
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (!bearerConfere(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const portalUrl = `${base}/documentos`;

  // Multi-tenant: só os titulares/contratos do tenant do deploy. Falha fechada.
  let titularIds: string[];
  let contratoIds: string[];
  let tenantSlug: string;
  try {
    const escopo = await resolverEscopoTenant(supabase);
    tenantSlug = escopo.slug;
    titularIds = await titularIdsDoTenant(supabase, escopo);
    contratoIds = await contratoIdsDoTenant(supabase, escopo, titularIds);
  } catch (err) {
    console.error("[lembrar-passaporte] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  const resultado = { candidatos: 0, enviados: 0, sem_email: 0, ja_enviados: 0, erros: 0 };
  if (contratoIds.length === 0 || titularIds.length === 0) {
    return NextResponse.json({ ok: true, ...resultado });
  }

  // Titulares que JÁ TÊM passaporte no acervo -> não recebem lembrete.
  const comPassaporte = new Set<string>();
  for (const lote of emLotes(titularIds, 500)) {
    const { data, error } = await supabase
      .from("documentos")
      .select("titular_id")
      .eq("tipo_documento", "passaporte")
      .in("titular_id", lote);
    if (error) {
      console.error("[lembrar-passaporte] falha ao ler passaportes:", error.message);
      return NextResponse.json({ ok: false, erro: "Falha ao ler documentos" }, { status: 500 });
    }
    for (const r of (data ?? []) as { titular_id: string | null }[]) {
      if (r.titular_id) comPassaporte.add(r.titular_id);
    }
  }

  // Contratos em andamento do tenant, cujo titular não tem passaporte. Um candidato
  // por titular (o primeiro) — a chave é por titular, e o acervo também.
  type LinhaContrato = {
    id: string;
    titular_id: string | null;
    estudante_nome: string | null;
    nome: string | null;
    cancelado_em: string | null;
  };
  const porTitular = new Map<string, LinhaContrato>();
  for (const lote of emLotes(contratoIds, 500)) {
    const { data, error } = await supabase
      .from("contratos")
      .select("id, titular_id, estudante_nome, nome, cancelado_em")
      .in("id", lote)
      .is("cancelado_em", null);
    if (error) {
      console.error("[lembrar-passaporte] falha ao ler contratos:", error.message);
      return NextResponse.json({ ok: false, erro: "Falha ao ler contratos" }, { status: 500 });
    }
    for (const c of (data ?? []) as LinhaContrato[]) {
      if (!c.titular_id) continue;
      if (comPassaporte.has(c.titular_id)) continue; // titular já tem passaporte
      if (porTitular.has(c.titular_id)) continue; // já achamos um contrato ativo deste titular
      // Estado DERIVADO (não a coluna crua): contratos do CRM têm estado NULL e
      // proposta_expirada é só derivado. Só cliente ATIVO (entrada_paga..retorno)
      // recebe — exclui proposta ainda não paga, expirada, cancelado e concluído.
      const estado = await estadoDoContrato(supabase, c.id);
      if (!clienteAtivo(estado)) continue;
      porTitular.set(c.titular_id, c);
    }
  }

  if (porTitular.size === 0) return NextResponse.json({ ok: true, ...resultado });

  // E-mail + nome do titular de cada candidato.
  const titularesAlvo = [...porTitular.keys()];
  const titularInfo = new Map<string, { nome: string; email: string }>();
  for (const lote of emLotes(titularesAlvo, 500)) {
    const { data, error } = await supabase
      .from("titulares")
      .select("id, nome_completo, email")
      .in("id", lote);
    if (error) {
      console.error("[lembrar-passaporte] falha ao ler titulares:", error.message);
      return NextResponse.json({ ok: false, erro: "Falha ao ler titulares" }, { status: 500 });
    }
    for (const r of (data ?? []) as { id: string; nome_completo: string | null; email: string | null }[]) {
      titularInfo.set(r.id, { nome: r.nome_completo ?? "", email: (r.email ?? "").trim() });
    }
  }

  for (const [titularId, c] of porTitular) {
    resultado.candidatos++;
    const info = titularInfo.get(titularId);
    const email = info?.email ?? "";
    if (!email) {
      resultado.sem_email++;
      continue; // sem e-mail do titular -> não dá para enviar; não cria claim
    }

    const chave = `lembrete_passaporte:${titularId}`;
    const decisao = await reivindicarEnvio(supabase, chave, titularId, {
      titular_id: titularId,
      contrato_id: c.id,
    });
    if (decisao === "erro") {
      resultado.erros++;
      continue;
    }
    if (decisao === "pular") {
      resultado.ja_enviados++;
      continue;
    }

    try {
      await enviarSolicitacaoPassaporteEmail(
        email,
        info?.nome ?? "",
        { estudante: c.estudante_nome ?? "", portalUrl },
        tenantSlug,
      );
      resultado.enviados++;
      // Confirma o claim; se não confirmar (após retries), conta erro p/ visibilidade
      // (o claim segue `pendente` e poderia reenviar na próxima varredura).
      if (!(await marcarEnviado(supabase, chave))) resultado.erros++;
    } catch {
      // Não logar o erro cru (pode conter o e-mail). Falha já fica em email_logs. O
      // claim segue `pendente` -> a próxima varredura reenvia.
      resultado.erros++;
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
