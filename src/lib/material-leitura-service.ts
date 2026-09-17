// LEITURA DE MATERIAL POR IA (F3.1 price list; F3.2 brochura; F3.3 promocao) — parte impura.
// SERVER-ONLY (service role): rotas (cron / admin) criam o cliente e o passam.
// Fluxo: claim atomico do material -> baixa o arquivo do Storage -> extrator por
// tipo -> cria SUBMISSIONS PENDENTES vinculadas ao material -> marca 'lida'.
// "A IA le, o humano publica": nada aqui materializa preco nem publica conteudo;
// as filas de aprovacao existentes e que publicam. NUNCA lanca.
//
// Robustez (revisoes F3.1/F3.2): toda transicao de leitura_status e CAS; claim
// OBSOLETO e retomado apos LEITURA_CLAIM_OBSOLETO_MIN; falha transitoria devolve a
// fila ate LEITURA_MAX_TENTATIVAS; 'sem_ia' NAO tira da fila; extracao com timeout;
// "ler de novo" substitui a proposta de PRECO aberta anterior. Brochura: NUNCA
// sequestra rascunho que a ESCOLA esta editando (so reaproveita rascunho criado por
// esta leitura), merge campo a campo (mantem o que existe quando o extraido vem
// vazio), teto de secoes por leitura (orcamento de tempo da funcao), 4xx da API e
// imagem grande = erro definitivo (nao gasta tentativas), "tudo ja em aprovacao" =
// 'ja_lida' (nao 'erro').
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairPriceListPdf, contarItens, type ResultadoExtracao } from "@/lib/price-list-extract";
import { criarSubmission } from "@/lib/price-submission-service";
import {
  extrairBrochura,
  contarSecoes,
  casarProdutos,
  localeDoIdioma,
  paraHtml,
  type ResultadoExtracaoBrochura,
  type ProdutoCandidato,
  type SecaoExtraida,
  type EscolaExtraida,
} from "@/lib/brochura-extract";
import {
  obterOuCriarRascunho,
  salvarRascunhoConteudo,
  enviarConteudoParaAdmin,
  listarProdutosDoFornecedor as listarProdutosDoFornecedorPorKind,
  type ConteudoPayload,
} from "@/lib/content-submission-service";
import {
  obterOuCriarRascunhoCampus,
  salvarRascunhoCampus,
  enviarConteudoCampusParaAdmin,
} from "@/lib/campus-content-submission-service";
import type { CampusContentPayload } from "@/lib/campus-conteudo";
import { extrairPromocoes, normalizarPromocoesExtraidas, type PromocaoExtraida } from "@/lib/promocao-extract";
import { criarPropostasPromocao } from "@/lib/promocao-proposta-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { podeLer, resolverCampusParaLeitura, MIMES_IMAGEM, type StatusLeitura } from "@/lib/material-leitura";

const BUCKET = "documentos-fornecedor";
const PDF_MAX_BYTES = Number(process.env.PDF_MAX_BYTES || String(10 * 1024 * 1024));
const IMAGEM_MAX_BYTES = Number(process.env.LEITURA_IMAGEM_MAX_BYTES || String(5 * 1024 * 1024)); // teto da API p/ imagem
const CLAIM_OBSOLETO_MIN = Number(process.env.LEITURA_CLAIM_OBSOLETO_MIN || "15");
const MAX_TENTATIVAS = Number(process.env.LEITURA_MAX_TENTATIVAS || "3");
const TIMEOUT_MS = Number(process.env.LEITURA_TIMEOUT_MS || "40000");
const LIMIAR_CASAMENTO = Number(process.env.LEITURA_LIMIAR_CASAMENTO || "0.6");
const MAX_SECOES_POR_LEITURA = Number(process.env.LEITURA_MAX_SECOES || "20"); // orcamento de tempo da funcao

const PREFIXO_IA = "leitura-ia:";

export type ResultadoLeitura = {
  materialId: string;
  status: StatusLeitura | "ja_lida" | "nao_encontrado" | "em_leitura" | "nao_legivel";
  submissionId: string | null; // proposta principal (preco) quando houver
  itens: number; // itens do price list OU propostas de conteudo criadas
  erro: string | null;
  resumo?: string; // texto curto para a UI (ex.: casamentos da brochura)
};

export type PropostaDoMaterial = { id: string; status: string; tipo: "preco" | "curso" | "acomodacao" | "escola" | "promocao"; href: string };

type MaterialRow = {
  id: string;
  supplier_id: string;
  tipo: string;
  mime: string | null;
  link_url: string | null;
  storage_path: string | null;
  nome_arquivo: string | null;
  status: string;
  archived_at: string | null;
  leitura_status: string;
  leitura_em: string | null;
  leitura_tentativas: number | null;
};

function limiteClaimISO(): string {
  return new Date(Date.now() - CLAIM_OBSOLETO_MIN * 60_000).toISOString();
}

// Ids dos materiais na fila do tenant, mais antigos primeiro: 'pendente' OU 'lendo'
// com claim obsoleto. So material ja APROVADO pelo admin (F2). O cron processa ate
// `limite` por execucao; o botao manual continua disponivel para pendentes.
export async function materiaisParaLer(supabase: SupabaseClient, tenantId: string, limite: number): Promise<string[]> {
  const { data } = await supabase
    .from("material")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "aprovado")
    .is("archived_at", null)
    .or(`leitura_status.eq.pendente,and(leitura_status.eq.lendo,leitura_em.lt.${limiteClaimISO()})`)
    .order("created_at", { ascending: true })
    .limit(limite);
  return (data ?? []).map((r: { id: string }) => r.id);
}

// Propostas geradas a partir de materiais deste fornecedor (preco, curso, acomodacao,
// escola), para o hub linkar "revisar". Escopo tenant + supplier.
export async function propostasPorMaterial(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<Record<string, PropostaDoMaterial[]>> {
  const [preco, conteudo, escola, promo] = await Promise.all([
    supabase
      .from("price_submission")
      .select("id, status, source_material_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .not("source_material_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("content_submission")
      .select("id, status, kind, source_material_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .not("source_material_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("campus_content_submission")
      .select("id, status, source_material_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .not("source_material_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("promotion_submission")
      .select("id, status, source_material_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .not("source_material_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  const out: Record<string, PropostaDoMaterial[]> = {};
  const add = (mid: string, p: PropostaDoMaterial) => {
    (out[mid] ??= []).push(p);
  };
  for (const r of (preco.data ?? []) as Array<{ id: string; status: string; source_material_id: string }>) {
    add(r.source_material_id, { id: r.id, status: r.status, tipo: "preco", href: `/admin/precos/${r.id}` });
  }
  for (const r of (conteudo.data ?? []) as Array<{ id: string; status: string; kind: string; source_material_id: string }>) {
    const acom = r.kind === "accommodation";
    add(r.source_material_id, { id: r.id, status: r.status, tipo: acom ? "acomodacao" : "curso", href: acom ? `/admin/conteudo-acomodacoes/${r.id}` : `/admin/conteudo/${r.id}` });
  }
  for (const r of (escola.data ?? []) as Array<{ id: string; status: string; source_material_id: string }>) {
    add(r.source_material_id, { id: r.id, status: r.status, tipo: "escola", href: `/admin/conteudo-escolas/${r.id}` });
  }
  for (const r of (promo.data ?? []) as Array<{ id: string; status: string; source_material_id: string }>) {
    add(r.source_material_id, { id: r.id, status: r.status, tipo: "promocao", href: `/admin/precos/promocoes/propostas/${r.id}` });
  }
  return out;
}

// Transicao de leitura_status com CAS: so grava se o status atual for `esperado`.
async function marcar(
  supabase: SupabaseClient,
  tenantId: string,
  materialId: string,
  status: StatusLeitura,
  erro: string | null,
  esperado: string,
  tentativas?: number,
): Promise<void> {
  const patch: Record<string, unknown> = { leitura_status: status, leitura_em: new Date().toISOString(), leitura_erro: erro };
  if (tentativas !== undefined) patch.leitura_tentativas = tentativas;
  await supabase.from("material").update(patch).eq("id", materialId).eq("tenant_id", tenantId).eq("leitura_status", esperado);
}

function comTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))]);
}

// Campi ATIVOS do fornecedor (a proposta de preco exige campus; a de escola tambem).
async function campiAtivos(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<Array<{ id: string }>> {
  const { data } = await supabase
    .from("campus")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("status", "active")
    .is("archived_at", null);
  return (data ?? []) as Array<{ id: string }>;
}

// Submission ABERTA (draft/pending_admin) de um produto/campus e quem a criou — para
// NAO sequestrar rascunho da escola nem sobrescrever o que ja aguarda aprovacao.
type Aberta = { id: string; status: string; created_by: string | null };
async function abertaDoProduto(supabase: SupabaseClient, tenantId: string, supplierId: string, productId: string): Promise<Aberta | null> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, status, created_by")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("product_id", productId)
    .in("status", ["draft", "pending_admin"])
    .maybeSingle();
  return (data as Aberta | null) ?? null;
}
async function abertaDoCampus(supabase: SupabaseClient, tenantId: string, supplierId: string, campusId: string): Promise<Aberta | null> {
  const { data } = await supabase
    .from("campus_content_submission")
    .select("id, status, created_by")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("campus_id", campusId)
    .in("status", ["draft", "pending_admin"])
    .maybeSingle();
  return (data as Aberta | null) ?? null;
}
// Rascunho reaproveitavel = criado por esta ferramenta (prefixo). Qualquer outro
// draft e da ESCOLA (portal) e fica intocado.
function rascunhoDaIA(a: Aberta): boolean {
  return a.status === "draft" && !!a.created_by && a.created_by.startsWith(PREFIXO_IA);
}

// Merge campo a campo do locale extraido sobre o existente: o que a IA nao trouxe
// (descricao vazia, lista vazia) NAO apaga o que ja estava.
function mesclarLocaleProduto(
  existente: ConteudoPayload["content"][number] | undefined,
  locale: ConteudoPayload["content"][number]["locale"],
  secao: SecaoExtraida,
): ConteudoPayload["content"][number] {
  return {
    locale,
    description_html: paraHtml(secao.descricao) ?? existente?.description_html ?? null,
    highlights: secao.destaques.length ? secao.destaques : existente?.highlights ?? [],
    inclusions: secao.inclusoes.length ? secao.inclusoes : existente?.inclusions ?? [],
    exclusions: secao.exclusoes.length ? secao.exclusoes : existente?.exclusions ?? [],
    is_machine_translated: false,
  };
}
function mesclarLocaleCampus(
  existente: CampusContentPayload["content"][number] | undefined,
  locale: CampusContentPayload["content"][number]["locale"],
  esc: EscolaExtraida,
): CampusContentPayload["content"][number] {
  return {
    locale,
    description_html: paraHtml(esc.descricao) ?? existente?.description_html ?? null,
    highlights: esc.destaques.length ? esc.destaques : existente?.highlights ?? [],
    highlights_footer: existente?.highlights_footer ?? null, // nunca zera o que a escola escreveu
    is_machine_translated: false,
  };
}

// Le UM material. `campusId` = escolha do admin (price list exige campus; brochura usa
// para o bloco da escola); `forcar` = reler um material ja processado. Idempotente
// por padrao: proposta(s) aberta(s) deste material = 'ja_lida' sem gastar IA.
export async function lerMaterial(
  supabase: SupabaseClient,
  args: { tenantId: string; materialId: string; actor: string; ip?: string | null; campusId?: string | null; forcar?: boolean },
): Promise<ResultadoLeitura> {
  const { tenantId, materialId, actor } = args;
  const autorIA = `${PREFIXO_IA}${actor}`;
  const base = { materialId, submissionId: null as string | null, itens: 0, erro: null as string | null };

  const { data: m } = await supabase
    .from("material")
    .select("id, supplier_id, tipo, mime, link_url, storage_path, nome_arquivo, status, archived_at, leitura_status, leitura_em, leitura_tentativas")
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const mat = m as MaterialRow | null;
  if (!mat) return { ...base, status: "nao_encontrado", erro: "material não encontrado" };

  const claimObsoleto = mat.leitura_status === "lendo" && (!mat.leitura_em || mat.leitura_em < limiteClaimISO());
  const decisao = podeLer(
    { tipo: mat.tipo, mime: mat.mime, linkUrl: mat.link_url, storagePath: mat.storage_path, status: mat.status, archivedAt: mat.archived_at, leituraStatus: mat.leitura_status },
    !!args.forcar,
    claimObsoleto,
  );
  if (!decisao.ok) {
    if (decisao.statusDestino && decisao.statusDestino !== mat.leitura_status) {
      await marcar(supabase, tenantId, materialId, decisao.statusDestino, decisao.motivo, mat.leitura_status);
    }
    return { ...base, status: mat.leitura_status === "lendo" ? "em_leitura" : "nao_legivel", erro: decisao.motivo };
  }

  // Idempotencia SEM forcar: ja existe proposta aberta gerada deste material? Devolve.
  let abertaIds: string[] = []; // price list: para substituir ao forcar
  if (mat.tipo === "price_list") {
    const { data: abertas } = await supabase
      .from("price_submission")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_material_id", materialId)
      .in("status", ["draft", "pending_admin"]);
    abertaIds = (abertas ?? []).map((r: { id: string }) => r.id);
    if (abertaIds.length > 0 && !args.forcar) return { ...base, status: "ja_lida", submissionId: abertaIds[0] };
  } else if (!args.forcar) {
    const [c, e, pr] = await Promise.all([
      supabase.from("content_submission").select("id").eq("tenant_id", tenantId).eq("source_material_id", materialId).eq("status", "pending_admin").limit(1),
      supabase.from("campus_content_submission").select("id").eq("tenant_id", tenantId).eq("source_material_id", materialId).eq("status", "pending_admin").limit(1),
      supabase.from("promotion_submission").select("id").eq("tenant_id", tenantId).eq("source_material_id", materialId).eq("status", "pending_admin").limit(1),
    ]);
    if ((c.data?.length ?? 0) + (e.data?.length ?? 0) + (pr.data?.length ?? 0) > 0) {
      return { ...base, status: "ja_lida", resumo: "Já há propostas deste material aguardando aprovação." };
    }
  }

  // Campus: obrigatorio para price list; opcional para brochura (bloco da escola).
  const campus = resolverCampusParaLeitura(await campiAtivos(supabase, tenantId, mat.supplier_id), args.campusId ?? null);
  if (mat.tipo === "price_list" && !campus.ok) {
    await marcar(supabase, tenantId, materialId, "precisa_campus", campus.motivo, mat.leitura_status);
    return { ...base, status: "precisa_campus", erro: campus.motivo };
  }

  // Claim atomico: so um leitor por vez; um claim OBSOLETO pode ser retomado.
  const agora = new Date().toISOString();
  const { data: claim } = await supabase
    .from("material")
    .update({ leitura_status: "lendo", leitura_em: agora, leitura_erro: null })
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .or(`leitura_status.neq.lendo,leitura_em.lt.${limiteClaimISO()}`)
    .select("id");
  if (!claim || claim.length === 0) return { ...base, status: "em_leitura", erro: "leitura já em andamento" };

  const tentativas = Number(mat.leitura_tentativas ?? 0);
  const falhaTransitoria = async (msg: string): Promise<ResultadoLeitura> => {
    const n = tentativas + 1;
    if (n < MAX_TENTATIVAS) {
      await marcar(supabase, tenantId, materialId, "pendente", `${msg} (tentativa ${n}/${MAX_TENTATIVAS} — volta à fila)`, "lendo", n);
      return { ...base, status: "pendente", erro: msg };
    }
    await marcar(supabase, tenantId, materialId, "erro", `${msg} (${MAX_TENTATIVAS} tentativas)`, "lendo", n);
    return { ...base, status: "erro", erro: msg };
  };
  const erroDefinitivo = async (msg: string, curto: string): Promise<ResultadoLeitura> => {
    await marcar(supabase, tenantId, materialId, "erro", msg, "lendo");
    return { ...base, status: "erro", erro: curto };
  };
  const semIA = async (): Promise<ResultadoLeitura> => {
    await marcar(supabase, tenantId, materialId, "pendente", "IA não configurada (ANTHROPIC_API_KEY) — permanece na fila", "lendo");
    return { ...base, status: "sem_ia", erro: "sem_ia" };
  };

  try {
    const ehImagem = !!mat.mime && (MIMES_IMAGEM as readonly string[]).includes(mat.mime);
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(mat.storage_path as string);
    if (dlErr || !blob) return falhaTransitoria("não foi possível baixar o arquivo do Storage");
    if (typeof blob.size === "number") {
      if (ehImagem && blob.size > IMAGEM_MAX_BYTES) {
        return erroDefinitivo("imagem acima de 5 MB — reduza a imagem ou envie a brochura em PDF", "imagem grande");
      }
      if (blob.size > PDF_MAX_BYTES) return erroDefinitivo("arquivo acima do limite de leitura", "arquivo grande");
    }
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const hoje = new Date().toISOString().slice(0, 10);

    // F3.3: promocoes lidas (do flyer, ou mencionadas no price list / brochura) viram
    // propostas PENDENTES em promotion_submission. Falha aqui NAO derruba a leitura
    // principal — vira contagem em `falhas`.
    const produtosPromo = async () => {
      const [pg, ac] = await Promise.all([
        listarProdutosDoFornecedorPorKind(supabase, mat.supplier_id, "program"),
        listarProdutosDoFornecedorPorKind(supabase, mat.supplier_id, "accommodation"),
      ]);
      return [...pg, ...ac];
    };
    const gerarPromocoes = async (lista: PromocaoExtraida[]) => {
      if (lista.length === 0) return { criadas: [], puladas: [], substituidas: 0, falhas: [] as string[] };
      try {
        return await criarPropostasPromocao(supabase, {
          tenantId,
          supplierId: mat.supplier_id,
          campusId: campus.ok ? campus.campusId : null,
          materialId,
          filename: mat.nome_arquivo,
          promocoes: lista,
          produtos: await produtosPromo(),
          actor,
          forcar: !!args.forcar,
          hoje,
        });
      } catch (err) {
        console.error("[material-leitura] promocoes:", err instanceof Error ? err.message : "erro");
        return { criadas: [], puladas: [], substituidas: 0, falhas: lista.map((p) => p.nome) };
      }
    };
    const resumoPromo = (r: Awaited<ReturnType<typeof gerarPromocoes>>) => {
      const partes: string[] = [];
      if (r.criadas.length) partes.push(`${r.criadas.length} promoção(ões) proposta(s): ${r.criadas.slice(0, 4).map((c) => c.nome).join(", ")}`);
      if (r.puladas.length) partes.push(`${r.puladas.length} promoção(ões) já em aprovação`);
      if (r.substituidas) partes.push(`${r.substituidas} proposta(s) de promoção substituída(s)`);
      if (r.falhas.length) partes.push(`${r.falhas.length} promoção(ões) falharam ao gravar: ${r.falhas.slice(0, 3).join(", ")}`);
      return partes.join(" · ");
    };

    // ── PRICE LIST → proposta de preco ─────────────────────────────────────
    if (mat.tipo === "price_list") {
      const ex = await comTimeout<ResultadoExtracao>(extrairPriceListPdf(base64), { ok: false, status: "erro", erro: "timeout" });
      if (!ex.ok) return ex.status === "sem_ia" ? semIA() : falhaTransitoria("a IA não conseguiu ler o PDF");
      if (!ex.dados.currency) {
        return erroDefinitivo("moeda não identificada no PDF (ex.: CAD, EUR) — o PDF precisa indicar a moeda dos preços", "sem moeda");
      }
      const itens = contarItens(ex.dados);
      if (itens === 0) return erroDefinitivo("a IA não encontrou programas, acomodações ou taxas no PDF", "sem itens");

      if (abertaIds.length > 0) {
        await supabase
          .from("price_submission")
          .update({ status: "rejected", rejected_by: actor, rejected_at: agora, reject_reason: "Substituída por nova leitura do material.", updated_at: agora })
          .eq("tenant_id", tenantId)
          .in("id", abertaIds)
          .in("status", ["draft", "pending_admin"]);
      }
      const campusId = campus.ok ? campus.campusId : null;
      const sub = await criarSubmission(supabase, {
        tenantId,
        supplierId: mat.supplier_id,
        campusId,
        sourceStoragePath: mat.storage_path,
        sourceFilename: mat.nome_arquivo,
        extracted: ex.dados,
        extractStatus: "ok",
        createdBy: actor,
        status: "pending_admin",
        sourceMaterialId: materialId,
        submittedBy: autorIA,
      });
      if (!sub.ok) return falhaTransitoria(sub.erro);
      const promo = await gerarPromocoes(normalizarPromocoesExtraidas(ex.promocoesBrutas));

      await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
      await registrarAuditoriaAdmin(supabase, {
        usuario: actor,
        acao: "fornecedores.material.ler",
        alvo: materialId,
        detalhe: { tipo: "price_list", supplier_id: mat.supplier_id, campus_id: campusId, submission_id: sub.id, itens, forcar: !!args.forcar, substituidas: abertaIds.length, promocoes: promo },
        ip: args.ip ?? null,
      });
      return { ...base, status: "lida", submissionId: sub.id, itens, resumo: [`Proposta de preço com ${itens} itens.`, resumoPromo(promo)].filter(Boolean).join(" · ") };
    }

    // ── PROMOCAO (flyer) → propostas de promocao ───────────────────────────
    if (mat.tipo === "promocao") {
      const exp = await comTimeout(extrairPromocoes(base64, mat.mime ?? "", ehImagem), { ok: false as const, status: "erro" as const, erro: "timeout" });
      if (!exp.ok) {
        if (exp.status === "sem_ia") return semIA();
        if (exp.definitivo) return erroDefinitivo("a IA rejeitou o arquivo (formato, tamanho ou número de páginas) — envie um PDF menor ou uma imagem até 5 MB", "arquivo rejeitado");
        return falhaTransitoria("a IA não conseguiu ler o material de promoção");
      }
      if (exp.dados.length === 0) return erroDefinitivo("a IA não encontrou promoções/ofertas com condição ou prazo neste material", "sem promoções");
      const promo = await gerarPromocoes(exp.dados);
      const resumoP = resumoPromo(promo);
      // So falhas de gravacao (banco): transitorio — volta a fila, nao e erro definitivo.
      if (promo.criadas.length === 0 && promo.puladas.length === 0 && promo.falhas.length > 0) {
        return falhaTransitoria("as promoções lidas não puderam ser gravadas");
      }
      const detalheP = { tipo: "promocao", supplier_id: mat.supplier_id, campus_id: campus.ok ? campus.campusId : null, promocoes: promo, forcar: !!args.forcar };
      if (promo.criadas.length === 0) {
        if (promo.puladas.length > 0) {
          await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
          await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fornecedores.material.ler", alvo: materialId, detalhe: detalheP, ip: args.ip ?? null });
          return { ...base, status: "ja_lida", resumo: resumoP };
        }
        return erroDefinitivo(`nada gerado — ${resumoP || "as promoções lidas não puderam ser gravadas"}`, "sem propostas");
      }
      await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
      await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fornecedores.material.ler", alvo: materialId, detalhe: detalheP, ip: args.ip ?? null });
      return { ...base, status: "lida", itens: promo.criadas.length, resumo: resumoP };
    }

    // ── BROCHURA → propostas de conteudo (curso/acomodacao/escola) ─────────
    const ex = await comTimeout<ResultadoExtracaoBrochura>(extrairBrochura(base64, mat.mime ?? "", ehImagem), { ok: false, status: "erro", erro: "timeout" });
    if (!ex.ok) {
      if (ex.status === "sem_ia") return semIA();
      if (ex.definitivo) return erroDefinitivo("a IA rejeitou o arquivo (formato, tamanho ou número de páginas) — envie um PDF menor ou uma imagem até 5 MB", "arquivo rejeitado");
      return falhaTransitoria("a IA não conseguiu ler a brochura");
    }
    if (contarSecoes(ex.dados) === 0) return erroDefinitivo("a IA não encontrou texto de programas nem da escola na brochura", "sem seções");

    const locale = localeDoIdioma(ex.dados.idioma);
    const [programas, acomodacoes] = await Promise.all([
      listarProdutosDoFornecedorPorKind(supabase, mat.supplier_id, "program"),
      listarProdutosDoFornecedorPorKind(supabase, mat.supplier_id, "accommodation"),
    ]);
    const candidatos: ProdutoCandidato[] = [
      ...programas.map((p) => ({ id: p.id, name: p.name, kind: "program" as const })),
      ...acomodacoes.map((p) => ({ id: p.id, name: p.name, kind: "accommodation" as const })),
    ];
    const casamentos = casarProdutos(ex.dados.programas, candidatos, LIMIAR_CASAMENTO);
    const casadas = casamentos.filter((c) => c.productId);
    const semProduto = casamentos.filter((c) => !c.productId).map((c) => c.secao.nome);
    // Orcamento de tempo da funcao: processa ate MAX_SECOES_POR_LEITURA; o resto fica
    // para "ler de novo" (as ja pendentes sao puladas sem custo).
    const aProcessar = casadas.slice(0, MAX_SECOES_POR_LEITURA);
    const naoProcessadas = casadas.length - aProcessar.length;

    const criadas: Array<{ id: string; tipo: string; secao: string; produto: string | null; score: number }> = [];
    const pulados: string[] = []; // ja em aprovacao, ou rascunho da ESCOLA em edicao
    const falhas: string[] = [];

    for (const c of aProcessar) {
      const productId = c.productId as string;
      const kind = c.secao.tipo;
      const aberta = await abertaDoProduto(supabase, tenantId, mat.supplier_id, productId);
      if (aberta && !rascunhoDaIA(aberta)) {
        // pending_admin (escola ou IA anterior) ou draft da ESCOLA: nao toca.
        pulados.push(c.productName ?? c.secao.nome);
        continue;
      }
      const criouAgora = !aberta;
      const r = await obterOuCriarRascunho(supabase, { tenantId, supplierId: mat.supplier_id, productId, createdBy: autorIA, kind });
      if (!r.ok || r.detalhe.status !== "draft") {
        falhas.push(c.secao.nome);
        continue;
      }
      const existente = r.detalhe.payload.content.find((l) => l.locale === locale);
      const outros = r.detalhe.payload.content.filter((l) => l.locale !== locale);
      const payload: ConteudoPayload = { ...r.detalhe.payload, content: [...outros, mesclarLocaleProduto(existente, locale, c.secao)] };
      const salvo = await salvarRascunhoConteudo(supabase, mat.supplier_id, r.detalhe.id, payload);
      const enviado = salvo.ok ? await enviarConteudoParaAdmin(supabase, mat.supplier_id, r.detalhe.id, autorIA) : { ok: false };
      if (!enviado.ok) {
        falhas.push(c.secao.nome);
        // Nao deixa rascunho orfao (criado nesta rodada e nao enviado) no portal da escola.
        if (criouAgora) await supabase.from("content_submission").delete().eq("id", r.detalhe.id).eq("tenant_id", tenantId).eq("status", "draft");
        continue;
      }
      // Vinculo ao material; supplier_approved_at fica NULO — quem "aprovou" foi a IA, nao a escola.
      await supabase.from("content_submission").update({ source_material_id: materialId, supplier_approved_at: null }).eq("id", r.detalhe.id).eq("tenant_id", tenantId);
      criadas.push({ id: r.detalhe.id, tipo: kind === "accommodation" ? "acomodacao" : "curso", secao: c.secao.nome, produto: c.productName, score: Math.round(c.score * 100) });
    }

    // Bloco da escola (campus): so com campus resolvido e algum texto institucional.
    const esc = ex.dados.escola;
    const temEscola = !!(esc.descricao || esc.destaques.length || esc.comodidades.length || esc.acreditacoes.length);
    let escolaPulada = false;
    if (temEscola && campus.ok) {
      const aberta = await abertaDoCampus(supabase, tenantId, mat.supplier_id, campus.campusId);
      if (aberta && !rascunhoDaIA(aberta)) {
        escolaPulada = true;
      } else {
        const criouAgora = !aberta;
        const r = await obterOuCriarRascunhoCampus(supabase, { tenantId, supplierId: mat.supplier_id, campusId: campus.campusId, createdBy: autorIA });
        if (r.ok && r.detalhe.status === "draft") {
          const existente = r.detalhe.payload.content.find((l) => l.locale === locale);
          const outros = r.detalhe.payload.content.filter((l) => l.locale !== locale);
          const uniao = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
          const payload: CampusContentPayload = {
            ...r.detalhe.payload,
            content: [...outros, mesclarLocaleCampus(existente, locale, esc)],
            amenities: uniao(r.detalhe.payload.amenities, esc.comodidades),
            accreditations: uniao(r.detalhe.payload.accreditations, esc.acreditacoes),
          };
          const salvo = await salvarRascunhoCampus(supabase, mat.supplier_id, r.detalhe.id, payload);
          const enviado = salvo.ok ? await enviarConteudoCampusParaAdmin(supabase, mat.supplier_id, r.detalhe.id, autorIA) : { ok: false };
          if (enviado.ok) {
            await supabase.from("campus_content_submission").update({ source_material_id: materialId, supplier_approved_at: null }).eq("id", r.detalhe.id).eq("tenant_id", tenantId);
            criadas.push({ id: r.detalhe.id, tipo: "escola", secao: "(escola)", produto: null, score: 100 });
          } else {
            falhas.push("(escola)");
            if (criouAgora) await supabase.from("campus_content_submission").delete().eq("id", r.detalhe.id).eq("tenant_id", tenantId).eq("status", "draft");
          }
        } else if (r.ok) {
          escolaPulada = true;
        }
      }
    }

    const promo = await gerarPromocoes(normalizarPromocoesExtraidas(ex.promocoesBrutas));

    const partes: string[] = [];
    if (promo.criadas.length) partes.push(resumoPromo(promo));
    if (criadas.length) {
      const detalhe = criadas
        .filter((c) => c.tipo !== "escola")
        .slice(0, 6)
        .map((c) => `"${c.secao}" → ${c.produto} (${c.score}%)`)
        .join("; ");
      partes.push(`${criadas.length} proposta(s) aguardando sua aprovação${detalhe ? `: ${detalhe}` : ""}`);
    }
    if (pulados.length) partes.push(`${pulados.length} não tocada(s) — já em aprovação ou em edição pela escola`);
    if (escolaPulada) partes.push("bloco da escola não tocado (já em aprovação ou em edição pela escola)");
    if (temEscola && !campus.ok) partes.push("bloco da escola não gerado: escolha o campus e leia de novo");
    if (naoProcessadas > 0) partes.push(`${naoProcessadas} seção(ões) ficaram para a próxima leitura (teto por leitura)`);
    if (falhas.length) partes.push(`${falhas.length} falhou(aram) na validação: ${falhas.slice(0, 3).join(", ")}`);
    if (semProduto.length) partes.push(`sem produto correspondente: ${semProduto.slice(0, 5).join(", ")}${semProduto.length > 5 ? "…" : ""}`);
    const resumo = partes.join(" · ");

    const auditDetalhe = {
      tipo: "brochura",
      supplier_id: mat.supplier_id,
      campus_id: campus.ok ? campus.campusId : null,
      locale,
      criadas,
      pulados,
      falhas,
      sem_produto: semProduto,
      nao_processadas: naoProcessadas,
      notas: ex.dados.notas,
      promocoes: promo,
      forcar: !!args.forcar,
    };

    if (criadas.length === 0 && promo.criadas.length === 0) {
      // Tudo ja estava em aprovacao/edicao: nao e falha — e "ja lido".
      if (pulados.length > 0 || escolaPulada || promo.puladas.length > 0) {
        await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
        await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fornecedores.material.ler", alvo: materialId, detalhe: auditDetalhe, ip: args.ip ?? null });
        return { ...base, status: "ja_lida", resumo };
      }
      return erroDefinitivo(`nada gerado — ${resumo || "seções sem correspondência com os produtos do fornecedor"}`, "sem propostas");
    }

    await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fornecedores.material.ler", alvo: materialId, detalhe: auditDetalhe, ip: args.ip ?? null });
    return { ...base, status: "lida", itens: criadas.length + promo.criadas.length, resumo };
  } catch (err) {
    console.error("[material-leitura] falha inesperada:", err instanceof Error ? err.message : "erro");
    return falhaTransitoria("falha inesperada na leitura");
  }
}
