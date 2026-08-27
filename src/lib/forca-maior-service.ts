// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Automacao do processo E8 — FORCA MAIOR COLETIVA (doc 01 §4). Aplicada EM LOTE
// pelo gestor, por destino + periodo (opcional): abre o E8 em todos os contratos
// ativos do coorte (pausa a regua via suspende padrao) e envia a comunicacao
// padronizada a cada titular. NAO adia nem cancela — cada caso e roteado para
// E2 (adiar) ou E4/E6 (cancelar) conforme a escolha do cliente, conduzido pelo
// time (marco proprio).
//
// Idempotente: E8 e aberta no maximo uma vez por contrato; o e-mail so sai
// quando ABRE agora (re-aplicar nao re-spamma). O teto por execucao protege
// contra timeout; re-aplicar drena o restante (os ja abertos sao pulados).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { enviarAvisoForcaMaiorEmail } from "@/lib/email";
import { slugDoTenant } from "@/lib/tenant-slug";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Teto por execucao: o lote faz, por contrato, escritas no DB + um envio de
// e-mail SINCRONO ao Resend. 100 cabe com folga em maxDuration=60; re-aplicar
// drena o restante (idempotente: E8 ja aberta e pulada, e-mail nao re-spamma).
export const LIMITE_FORCA_MAIOR = 100;

type FiltroCoorte = { destino: string; inicioDe?: string | null; inicioAte?: string | null };
type ContratoCoorte = {
  id: string;
  titular_id: string;
  titular?:
    | { nome_completo?: string | null; email?: string | null; tenant_id?: string | null }
    | { nome_completo?: string | null; email?: string | null; tenant_id?: string | null }[]
    | null;
};

// Aplica o recorte do coorte a uma query base. `selectArg`/`selectOpts` permitem
// tanto buscar linhas quanto contar (count exato com head) sem duplicar o filtro.
function aplicarFiltro(
  supabase: SupabaseClient,
  filtro: FiltroCoorte,
  selectArg: string,
  selectOpts?: { count: "exact"; head: true }
) {
  let q = supabase
    .from("contratos")
    .select(selectArg, selectOpts)
    .eq("pais_destino", filtro.destino)
    .is("cancelado_em", null);
  if (filtro.inicioDe) q = q.gte("data_inicio", filtro.inicioDe);
  if (filtro.inicioAte) q = q.lte("data_inicio", filtro.inicioAte);
  return q;
}

// Destinos com contratos ativos (para o seletor da tela). Deduplicado.
export async function destinosDisponiveis(): Promise<string[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("contratos")
    .select("pais_destino")
    .is("cancelado_em", null)
    .not("pais_destino", "is", null);
  const set = new Set<string>();
  for (const c of data || []) {
    const d = (c as { pais_destino?: string | null }).pais_destino;
    if (d) set.add(d);
  }
  return Array.from(set).sort();
}

// Preview: quantos contratos ativos o coorte atinge (sem escrever nada). Usa
// count EXATO com head (sem trazer linhas) — o preview e a trava de seguranca
// que o gestor le antes de aplicar; um select comum truncaria em ~1000 e
// subestimaria o blast radius.
export async function contarAfetados(filtro: FiltroCoorte): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await aplicarFiltro(supabase, filtro, "id", { count: "exact", head: true });
  if (error) throw new Error("Falha ao ler o coorte: " + error.message);
  return count ?? 0;
}

export type ResultadoForcaMaior = {
  afetados: number; // contratos no coorte (ate o teto)
  abertas: number; // E8 abertas agora
  jaAbertas: number; // ja tinham E8 ativa
  avisos: number; // e-mails enviados
  erros: number;
  truncado: boolean; // coorte maior que o teto — re-aplicar para o restante
};

// Aplica a forca maior no coorte. `motivo` (justificativa do gestor) e obrigatorio
// no chamador (rota). Best-effort por contrato: uma falha isolada nao impede os
// demais. So-gestor: a autorizacao e feita na rota (config.gerir).
export async function aplicarForcaMaior(args: {
  destino: string;
  inicioDe?: string | null;
  inicioAte?: string | null;
  motivo: string;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoForcaMaior> {
  const supabase = getSupabase();
  const filtro = { destino: args.destino, inicioDe: args.inicioDe, inicioAte: args.inicioAte };

  const { data, error } = await aplicarFiltro(
    supabase,
    filtro,
    "id, titular_id, titular:titulares(nome_completo, email, tenant_id)"
  )
    .order("data_inicio", { ascending: true })
    .limit(LIMITE_FORCA_MAIOR + 1);
  if (error) throw new Error("Falha ao ler o coorte: " + error.message);

  const todos = (data || []) as unknown as ContratoCoorte[];
  const truncado = todos.length > LIMITE_FORCA_MAIOR;
  const lote = truncado ? todos.slice(0, LIMITE_FORCA_MAIOR) : todos;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  const res: ResultadoForcaMaior = {
    afetados: lote.length,
    abertas: 0,
    jaAbertas: 0,
    avisos: 0,
    erros: 0,
    truncado,
  };

  for (const c of lote) {
    let abriu = false;
    try {
      await abrirExcecao({
        contratoId: c.id,
        tipo: "forca_maior",
        motivo: args.motivo,
        titularIdEsperado: c.titular_id,
        autor: args.autor,
        ip: args.ip ?? null,
      });
      abriu = true;
      res.abertas++;
    } catch (err) {
      if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") {
        res.jaAbertas++;
      } else {
        res.erros++;
        console.error("[forca-maior] falha ao abrir E8 para um contrato");
        continue;
      }
    }

    // E-mail padronizado so quando ABRIU agora (re-aplicar nao re-spamma).
    if (abriu) {
      const titular = Array.isArray(c.titular) ? c.titular[0] : c.titular;
      if (titular?.email) {
        const slug = await slugDoTenant(supabase, titular.tenant_id);
        try {
          await enviarAvisoForcaMaiorEmail(titular.email, titular.nome_completo || "", appUrl || null, slug);
          res.avisos++;
        } catch {
          console.error("[forca-maior] falha ao enviar comunicacao a um titular (ver email_logs)");
        }
      }
    }
  }

  // Trilha do lote (alem do excecao.abrir por contrato que o abrirExcecao grava).
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "forca_maior.aplicar",
    alvo: args.destino,
    detalhe: {
      destino: args.destino,
      inicio_de: args.inicioDe || null,
      inicio_ate: args.inicioAte || null,
      motivo: args.motivo,
      afetados: res.afetados,
      abertas: res.abertas,
      ja_abertas: res.jaAbertas,
      truncado: res.truncado,
    },
    ip: args.ip ?? null,
  });

  return res;
}
