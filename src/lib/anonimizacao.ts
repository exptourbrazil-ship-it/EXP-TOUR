// Motor PURO da ANONIMIZACAO de dados do titular (LGPD art. 18 — direito de
// eliminacao). Modelo: ANONIMIZAR, nao apagar. A PII do titular (nome, CPF,
// telefone, nome do estudante, IPs de prova) e removida/tombstonada, mas os
// registros FINANCEIROS/CONTRATUAIS (contratos, parcelas, pagamentos, acertos) e
// o ledger de consentimentos SAO PRESERVADOS — cumpre a retencao legal/fiscal
// (art. 16) e o direito de eliminacao da PII ao mesmo tempo.
//
// Elegibilidade: so quando TODOS os contratos do titular estao ENCERRADOS
// (cancelado, ou quitado e com o programa ja iniciado) — durante um contrato
// ativo, a PII e necessaria para a execucao.
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node e e
// testavel isolado. Nao toca banco — so decide elegibilidade e cataloga a PII.

// Valor com que os campos de texto identificaveis sao substituidos.
export const TOMBSTONE = "[anonimizado]";

// Catalogo (documental) dos campos de PII redigidos pela funcao SQL. Mantido aqui
// como fonte unica da INTENCAO; a redacao em si roda no banco (transacao).
export const CAMPOS_PII: Record<string, string[]> = {
  titulares: ["nome_completo", "cpf", "telefone", "email"],
  contratos: ["estudante_nome", "estudante_sexo", "estudante_email", "quadro_resumo", "hash_quadro"],
  consentimentos: ["ip"],
  repactuacoes: ["ip"],
  aceites: ["ip", "user_agent"],
  fichas_matricula_assinaturas: ["ip", "assinante_nome", "user_agent"],
  contratos_assinatura: ["signatarios"],
};

export type ContratoParaAnonimizar = {
  id: string;
  canceladoEm: string | null;
  temParcelaEmAberto: boolean; // alguma parcela nao paga
  dataInicio: string | null; // YYYY-MM-DD
};

export type ElegibilidadeAnonimizacao =
  | { ok: true }
  | { ok: false; motivo: string; contratosAtivos: string[] };

// Um contrato esta ENCERRADO para fins de anonimizacao quando:
//  - cancelado (cancelado_em setado), OU
//  - sem parcela em aberto E com o programa ja iniciado (data_inicio no passado).
// Enquanto ha parcela em aberto ou o programa nao comecou, o contrato e ATIVO e a
// PII e necessaria (falha fechada: sem data_inicio conhecida, NAO se considera
// encerrado por quitacao — so o cancelamento encerra).
export function contratoEncerrado(c: ContratoParaAnonimizar, hojeISO: string): boolean {
  if (c.canceladoEm) return true;
  return !c.temParcelaEmAberto && !!c.dataInicio && c.dataInicio.slice(0, 10) < hojeISO;
}

// Elegivel para anonimizar quando TODOS os contratos estao encerrados. Um titular
// sem contratos e elegivel (nada ativo). Lista os contratos que bloqueiam.
export function avaliarElegibilidade(
  contratos: ContratoParaAnonimizar[],
  hojeISO: string,
): ElegibilidadeAnonimizacao {
  const ativos = (Array.isArray(contratos) ? contratos : [])
    .filter((c) => !contratoEncerrado(c, hojeISO))
    .map((c) => c.id);
  if (ativos.length > 0) return { ok: false, motivo: "contrato_ativo", contratosAtivos: ativos };
  return { ok: true };
}
