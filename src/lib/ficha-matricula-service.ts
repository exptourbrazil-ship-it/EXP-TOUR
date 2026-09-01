// Data layer da Ficha de Matricula (Clausulas 2.5e / 8.4). Server-only: service
// role. Escopado por POSSE (o contrato tem de ser do titular). A ficha so pode
// ser assinada DEPOIS da Entrada; marcar "processamento imediato" LIBERA a trava
// da remessa (contratos.processamento_imediato). Ver src/lib/ficha-matricula.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  signatariosNecessarios,
  fichaCompleta,
  papeisPendentes,
  FICHA_VERSAO,
  type PapelSignatario,
} from "@/lib/ficha-matricula";

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export type FichaEstado = {
  contratoId: string;
  programaNome: string;
  estudanteNome: string | null;
  entradaPaga: boolean; // gate: a ficha so vale depois da Entrada
  menor: boolean;
  papeisNecessarios: PapelSignatario[];
  papeisAssinados: PapelSignatario[];
  papeisPendentes: PapelSignatario[];
  status: "pendente" | "assinada";
  processamentoImediato: boolean;
  completa: boolean;
};

async function carregarContexto(supabase: SupabaseClient, titularId: string, contratoId: string) {
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, nome, estudante_nome, estudante_data_nascimento, titular_id")
    .eq("id", contratoId)
    .eq("titular_id", titularId)
    .maybeSingle();
  if (!contrato) return null;

  // Gate: a Entrada tem de estar paga.
  const { data: entrada } = await supabase
    .from("parcelas")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("is_entrada", true)
    .eq("status", "pago")
    .limit(1)
    .maybeSingle();

  const sig = signatariosNecessarios({
    nascimentoISO: (contrato.estudante_data_nascimento as string) ?? null,
    hojeISO: hojeBrasilISO(),
  });

  return { contrato, entradaPaga: !!entrada, sig };
}

export async function carregarFicha(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
): Promise<FichaEstado | null> {
  const ctx = await carregarContexto(supabase, titularId, contratoId);
  if (!ctx) return null;
  const { contrato, entradaPaga, sig } = ctx;

  const { data: ficha } = await supabase
    .from("fichas_matricula")
    .select("id, status, processamento_imediato")
    .eq("contrato_id", contratoId)
    .maybeSingle();

  let papeisAssinados: PapelSignatario[] = [];
  if (ficha?.id) {
    const { data: ass } = await supabase
      .from("fichas_matricula_assinaturas")
      .select("papel")
      .eq("ficha_id", ficha.id);
    papeisAssinados = (ass ?? []).map((a) => a.papel as PapelSignatario);
  }

  const status = (ficha?.status as "pendente" | "assinada") ?? "pendente";
  return {
    contratoId,
    programaNome: (contrato.nome as string) || "Programa",
    estudanteNome: (contrato.estudante_nome as string) ?? null,
    entradaPaga,
    menor: sig.menor,
    papeisNecessarios: sig.papeis,
    papeisAssinados,
    papeisPendentes: papeisPendentes(papeisAssinados, sig.papeis),
    status,
    processamentoImediato: !!ficha?.processamento_imediato,
    completa: fichaCompleta(papeisAssinados, sig.papeis),
  };
}

export type AssinarFichaEntrada = {
  papel: PapelSignatario;
  nome?: string | null;
  processamentoImediato: boolean;
};
export type AssinarCtx = { ip: string | null; userAgent: string | null; sessionId: string | null };

export async function assinarFicha(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
  entrada: AssinarFichaEntrada,
  ctx: AssinarCtx,
): Promise<{ ok: true; completa: boolean } | { ok: false; erro: string; status: number }> {
  const c = await carregarContexto(supabase, titularId, contratoId);
  if (!c) return { ok: false, erro: "Ficha não disponível para este contrato.", status: 404 };
  if (!c.entradaPaga) {
    return { ok: false, erro: "A ficha de matrícula fica disponível após o pagamento da Entrada.", status: 409 };
  }
  if (!c.sig.papeis.includes(entrada.papel)) {
    return { ok: false, erro: "Papel de signatário inválido para esta ficha.", status: 400 };
  }

  // Ficha (uma por contrato). Cria pendente se ainda nao existe.
  const { data: fichaExistente } = await supabase
    .from("fichas_matricula")
    .select("id, processamento_imediato")
    .eq("contrato_id", contratoId)
    .maybeSingle();

  let fichaId = fichaExistente?.id as string | undefined;
  if (!fichaId) {
    const { data: nova, error } = await supabase
      .from("fichas_matricula")
      .insert({ contrato_id: contratoId, titular_id: titularId, versao: FICHA_VERSAO, status: "pendente" })
      .select("id")
      .single();
    if (error || !nova) {
      // Corrida: outra requisicao criou -> recarrega.
      const { data: rec } = await supabase.from("fichas_matricula").select("id").eq("contrato_id", contratoId).maybeSingle();
      if (!rec?.id) return { ok: false, erro: "Não foi possível abrir a ficha.", status: 500 };
      fichaId = rec.id as string;
    } else {
      fichaId = nova.id as string;
    }
  }

  // Prova da assinatura do papel (idempotente por (ficha, papel)). 23505 = ja
  // assinou este papel (no-op esperado); OUTRO erro e real -> aborta ANTES de
  // tocar ficha/contrato (nunca levanta a trava sem prova de assinatura gravada).
  const { error: insErr } = await supabase.from("fichas_matricula_assinaturas").insert({
    ficha_id: fichaId,
    papel: entrada.papel,
    assinante_nome: ((entrada.nome && entrada.nome.trim()) || "").slice(0, 200) || null,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    session_id: ctx.sessionId,
  });
  if (insErr && (insErr as { code?: string }).code !== "23505") {
    return { ok: false, erro: "Não foi possível registrar a assinatura.", status: 500 };
  }

  // Completude a partir de leitura FRESCA das assinaturas persistidas.
  const { data: ass } = await supabase.from("fichas_matricula_assinaturas").select("papel").eq("ficha_id", fichaId);
  const assinados = (ass ?? []).map((a) => a.papel as PapelSignatario);
  const completa = fichaCompleta(assinados, c.sig.papeis);

  // Autorizacao de processamento imediato: opt-in MONOTONICO (o que este signatario
  // marcou OU o que a ficha ja registrava; nunca regride).
  const piIntent = entrada.processamentoImediato || !!fichaExistente?.processamento_imediato;
  const patchFicha: Record<string, unknown> = {
    atualizada_em: new Date().toISOString(),
    processamento_imediato: piIntent,
  };
  if (completa) {
    patchFicha.status = "assinada";
    patchFicha.assinada_em = new Date().toISOString();
  }
  await supabase.from("fichas_matricula").update(patchFicha).eq("id", fichaId);

  // A trava da remessa (2.5.2 / 8.4) so e LEVANTADA quando a ficha esta COMPLETA
  // (TODOS os papeis exigidos pela idade — p.ex. participante E responsavel, no
  // caso de menor) E houve autorizacao de processamento imediato. Impede liberar
  // dinheiro com a marcacao de um unico signatario de uma ficha ainda pendente.
  if (completa && piIntent) {
    await supabase.from("contratos").update({ processamento_imediato: true }).eq("id", contratoId).eq("titular_id", titularId);
  }

  return { ok: true, completa };
}
