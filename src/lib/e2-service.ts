// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Automacao do processo E2 — ADIAMENTO DE INICIO / DEFERRAL (doc 01 §4). NESTE
// passo: abre o processo E2 (que suspende o AVANCO da jornada via suspende
// padrao do tipo) registrando a nova data solicitada, e cai na Fila do Dia
// roteado a Operacao para consultar a escola. NAO recalcula marcos/parcelas nem
// gera aditivo — o recalculo em cascata (motor de alteracao) e um marco proprio,
// junto do portal do fornecedor.
//
// Idempotente: E2 e aberta no maximo uma vez por contrato (indice unico parcial
// + excecao_ja_aberta = sucesso).
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";

export class DeferralBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "DeferralBloqueado";
    this.codigo = codigo;
  }
}

// Data ISO curta valida (YYYY-MM-DD) — a nova data solicitada e opcional (pode
// depender da consulta a escola).
export function dataInicioValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [ano, mes, dia] = s.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// Abre o E2 num contrato. Retorna true se abriu agora, false se ja havia um E2
// ativo. contrato de outro titular/inexistente -> DeferralBloqueado (400).
export async function abrirDeferralContrato(args: {
  contratoId: string;
  titularIdEsperado?: string;
  novaDataInicio?: string | null;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<boolean> {
  if (args.novaDataInicio && !dataInicioValida(args.novaDataInicio)) {
    throw new DeferralBloqueado("data_invalida", "Nova data de inicio invalida");
  }

  const partes: string[] = ["Pedido de adiamento de inicio (deferral)"];
  if (args.novaDataInicio) partes.push(`nova data solicitada: ${args.novaDataInicio}`);
  if (args.motivo && args.motivo.trim()) partes.push(args.motivo.trim());
  const motivo = partes.join(" — ").slice(0, 2000);

  try {
    await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "deferral_inicio",
      motivo,
      titularIdEsperado: args.titularIdEsperado,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    return true;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") return false;
    if (err instanceof ExcecaoBloqueada) {
      throw new DeferralBloqueado(err.codigo, err.message);
    }
    throw err;
  }
}
