// NB: modulo server-only (service role). So deve ser importado por rotas/cron e
// server components — NUNCA por codigo client.
//
// Processo E11 — CLIENTE INCONTACTAVEL / PENDENCIA ETERNA (doc 01 §4). Escalada
// a humano quando o cliente parou de responder a uma pendencia. NESTE passo o
// E11 e um sinalizador: abre a excecao (que NAO suspende nada — suspendePadrao
// []), cai na Fila do Dia roteado a Operacao. NAO cobra, nao cancela, nao
// notifica o cliente automaticamente — a tratativa e humana.
//
// Idempotente: E11 e aberta no maximo uma vez por contrato (indice unico parcial
// + excecao_ja_aberta = sucesso).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export class IncontactavelBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "IncontactavelBloqueado";
    this.codigo = codigo;
  }
}

// Abre o E11 num contrato. Retorna true se abriu agora, false se ja havia um E11
// ativo. contrato de outro titular/inexistente -> IncontactavelBloqueado (400).
export async function abrirIncontactavelContrato(args: {
  contratoId: string;
  titularIdEsperado?: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<boolean> {
  try {
    await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "incontactavel",
      motivo: args.motivo || "Cliente incontactavel / pendencia parada",
      titularIdEsperado: args.titularIdEsperado,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    return true;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") return false;
    if (err instanceof ExcecaoBloqueada) {
      throw new IncontactavelBloqueado(err.codigo, err.message);
    }
    throw err;
  }
}

export type ResultadoIncontactavelTitular = { contratosAtivos: number; abertas: number };

// Abre o E11 para os contratos ATIVOS (nao cancelados) de um titular. Usado pelo
// cron (a pendencia — documento rejeitado — e do titular, nao de um contrato
// especifico). Best-effort por contrato.
export async function abrirIncontactavelTitular(args: {
  titularId: string;
  motivo?: string | null;
  autor?: string;
}): Promise<ResultadoIncontactavelTitular> {
  const supabase = getSupabase();
  const autor = args.autor || "sistema";
  const { data: contratos, error } = await supabase
    .from("contratos")
    .select("id")
    .eq("titular_id", args.titularId)
    .is("cancelado_em", null);
  if (error) {
    throw new IncontactavelBloqueado("falha_leitura_contratos", "Falha ao ler contratos do titular");
  }

  const lista = contratos || [];
  let abertas = 0;
  for (const c of lista) {
    try {
      const abriu = await abrirIncontactavelContrato({
        contratoId: c.id as string,
        titularIdEsperado: args.titularId,
        motivo: args.motivo,
        autor,
      });
      if (abriu) abertas++;
    } catch (err) {
      console.error("[e11] falha ao abrir E11 para um contrato do titular");
      void err;
    }
  }
  return { contratosAtivos: lista.length, abertas };
}
