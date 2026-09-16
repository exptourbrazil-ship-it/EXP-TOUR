// Regras PURAS da LEITURA DE MATERIAL por IA (F3.1). Sem rede/DB: decidem se um
// material e legivel, qual e o status inicial e como resolver o campus da
// proposta. Testado em material-leitura.test.ts. A parte impura (Storage, IA,
// banco) vive em material-leitura-service.ts.

export const STATUS_LEITURA = [
  "nao_aplicavel", // tipo de material que (ainda) nao e lido pela ferramenta
  "pendente", // na fila: o cron ou o botao "Ler com IA" vai processar
  "lendo", // claim em curso (evita leitura dupla)
  "lida", // proposta gerada (price_submission pendente na fila do admin)
  "sem_ia", // ANTHROPIC_API_KEY ausente — falha fechada, nada publicado
  "erro", // rede/parse/sem itens — ver leitura_erro
  "precisa_campus", // fornecedor com 0 ou >1 campi: o admin escolhe no botao
  "nao_suportado", // so PDF e lido nesta fatia (imagem/link ficam para F3.2)
] as const;
export type StatusLeitura = (typeof STATUS_LEITURA)[number];

export const STATUS_LEITURA_LABEL: Record<StatusLeitura, string> = {
  nao_aplicavel: "—",
  pendente: "na fila de leitura",
  lendo: "lendo…",
  lida: "lido — proposta gerada",
  sem_ia: "IA não configurada",
  erro: "falha na leitura",
  precisa_campus: "escolha o campus",
  nao_suportado: "só PDF é lido",
};

// Tipos de material que a ferramenta le nesta fatia (F3.1 = price list).
export const TIPOS_LEGIVEIS = ["price_list"] as const;

export function tipoLegivel(tipo: string): boolean {
  return (TIPOS_LEGIVEIS as readonly string[]).includes(tipo);
}

// Status inicial de um material recem-criado: entra na fila so se for de tipo
// legivel E arquivo PDF. Link e imagem: 'nao_suportado' (honesto, nao 'pendente').
export function statusLeituraInicial(tipo: string, mime: string | null, linkUrl: string | null): StatusLeitura {
  if (!tipoLegivel(tipo)) return "nao_aplicavel";
  if (linkUrl || mime !== "application/pdf") return "nao_suportado";
  return "pendente";
}

export type MaterialParaLeitura = {
  tipo: string;
  mime: string | null;
  linkUrl: string | null;
  storagePath: string | null;
  status: string; // pendente|aprovado|rejeitado (aprovacao do material, F2)
  archivedAt: string | null;
  leituraStatus: string;
};

export type DecisaoLeitura =
  | { ok: true }
  | { ok: false; motivo: string; statusDestino?: StatusLeitura };

// Pode ler agora? `forcar` = botao do admin (rele um material ja lido ou com erro).
// Sem forcar, so o que esta 'pendente'. Nunca le rejeitado/arquivado, nem tipo/
// formato nao suportado. 'lendo' (claim de outro leitor) so passa quando o claim e
// OBSOLETO (`claimObsoleto`: leitura_em antiga — processo morreu no meio); e assim
// que a fila se recupera sozinha de uma leitura interrompida.
export function podeLer(m: MaterialParaLeitura, forcar = false, claimObsoleto = false): DecisaoLeitura {
  if (m.archivedAt) return { ok: false, motivo: "material arquivado" };
  if (m.status === "rejeitado") return { ok: false, motivo: "material recusado — não é lido" };
  if (!tipoLegivel(m.tipo)) return { ok: false, motivo: "este tipo de material não é lido pela ferramenta", statusDestino: "nao_aplicavel" };
  if (m.linkUrl || !m.storagePath) return { ok: false, motivo: "material por link — só PDF é lido", statusDestino: "nao_suportado" };
  if (m.mime !== "application/pdf") return { ok: false, motivo: "só PDF é lido nesta etapa", statusDestino: "nao_suportado" };
  if (m.leituraStatus === "lendo") {
    if (claimObsoleto) return { ok: true }; // leitura anterior morreu: pode retomar
    return { ok: false, motivo: "leitura já em andamento" };
  }
  if (!forcar && m.leituraStatus !== "pendente") {
    return { ok: false, motivo: `material já processado (${m.leituraStatus}); use "Ler de novo" para forçar` };
  }
  return { ok: true };
}

// Campus da proposta: a price_submission so materializa com campus_id. Se o admin
// pediu um campus, ele tem que ser do fornecedor; senao, so resolve sozinho quando
// o fornecedor tem EXATAMENTE um campus.
export function resolverCampusParaLeitura(
  campi: Array<{ id: string }>,
  pedido?: string | null,
): { ok: true; campusId: string } | { ok: false; motivo: string } {
  if (pedido) {
    return campi.some((c) => c.id === pedido)
      ? { ok: true, campusId: pedido }
      : { ok: false, motivo: "campus informado não é deste fornecedor" };
  }
  if (campi.length === 1) return { ok: true, campusId: campi[0].id };
  if (campi.length === 0) return { ok: false, motivo: "fornecedor sem campus — crie um em Meus Campi" };
  return { ok: false, motivo: `fornecedor com ${campi.length} campi — escolha o campus ao ler` };
}
