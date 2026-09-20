// Internalizacao de midia do catalogo: copia as fotos de campus_media (e as capas de
// campus que apontam para a mesma URL) do site da escola para o bucket publico
// midia-catalogo e troca `url` pela URL do Storage. Motivo: o portal publico tem CSP
// `img-src` restrito a *.supabase.co, entao hotlink NAO renderiza; e a foto deixa de
// depender do site do fornecedor. Bounded (max por execucao + orcamento de tempo),
// idempotente (caminho = id da linha, upsert) e com teto de tentativas por linha.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET_MIDIA_CATALOGO,
  MIDIA_MAX_BYTES,
  MIDIA_MAX_TENTATIVAS,
  FAVICON_MAX_BYTES,
  caminhoStorageFavicon,
  caminhoStorageMidia,
  formatoDeImagem,
  ehUrlInterna,
  esperaDeHostMs,
  extensaoDeMime,
  ipEhPrivado,
  resumirErro,
  urlPublicaStorage,
  validarUrlExterna,
} from "@/lib/midia-internalizacao";

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
// Intervalo minimo entre dois downloads do MESMO host. As fotos de uma escola vem
// todas do mesmo dominio: sem isso, um lote (e ainda mais o botao do hub, que
// encadeia lotes) vira uma rajada contra o site do fornecedor — que responde com
// WAF/403 e passa a bloquear o IP da Vercel, degradando ate o cron das outras
// escolas. ~4 requisicoes por segundo por host e um ritmo educado.
const MIN_INTERVALO_HOST_MS = 250;
const UA_NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

type Linha = { id: string; campus_id: string; url: string; internalize_attempts: number };

export type ResultadoInternalizacao = {
  candidatas: number;
  internalizadas: number;
  capas_atualizadas: number;
  falhas: number;
  adiadas: number;
  /** Execucao interrompida por falha de infraestrutura (Storage) — nada foi contado como tentativa. */
  interrompida: string | null;
  erros: string[];
};

type Baixado = { bytes: Buffer; contentType: string };

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera o que falta para respeitar MIN_INTERVALO_HOST_MS naquele host. */
async function aguardarVezDoHost(host: string, ultimoPorHost: Map<string, number>): Promise<void> {
  const espera = esperaDeHostMs(ultimoPorHost.get(host), Date.now(), MIN_INTERVALO_HOST_MS);
  if (espera > 0) await dormir(espera);
  ultimoPorHost.set(host, Date.now());
}
type Falha = { ok: false; erro: string };

// Resolve o host e recusa se QUALQUER endereco for privado/local (SSRF via DNS).
async function hostResolvePublico(host: string): Promise<Falha | null> {
  try {
    const { lookup } = await import("node:dns/promises");
    const enderecos = await lookup(host, { all: true, verbatim: true });
    if (enderecos.length === 0) return { ok: false, erro: "host não resolve" };
    if (enderecos.some((e) => ipEhPrivado(e.address))) return { ok: false, erro: "host resolve para endereço interno" };
    return null;
  } catch {
    return { ok: false, erro: "host não resolve" };
  }
}

// Le o corpo em stream e aborta assim que passar do teto (Content-Length e opcional).
async function lerComTeto(resp: Response, ctrl: AbortController): Promise<Buffer | Falha> {
  if (!resp.body) return { ok: false, erro: "resposta vazia" };
  const partes: Uint8Array[] = [];
  let total = 0;
  const reader = resp.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MIDIA_MAX_BYTES) {
        ctrl.abort();
        return { ok: false, erro: "imagem acima de 10 MB" };
      }
      partes.push(value);
    }
  }
  if (total === 0) return { ok: false, erro: "resposta vazia" };
  return Buffer.concat(partes);
}

// Baixa a imagem: valida a URL (e cada Location de redirect) pelo nome E pelo IP
// resolvido, segue no maximo MAX_REDIRECTS saltos, aplica timeout e teto de bytes.
// Erro = string curta (vai para internalize_error).
export async function baixarImagem(
  url: string,
  fetchImpl: typeof fetch,
  ultimoPorHost?: Map<string, number>,
): Promise<{ ok: true; dados: Baixado } | Falha> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let atual = url;
    for (let salto = 0; ; salto++) {
      const v = validarUrlExterna(atual);
      if (!v.ok) return salto === 0 ? v : { ok: false, erro: `redirect recusado: ${v.erro}` };
      const dns = await hostResolvePublico(v.url.hostname);
      if (dns) return dns;
      if (ultimoPorHost) await aguardarVezDoHost(v.url.hostname, ultimoPorHost);

      const resp = await fetchImpl(v.url.toString(), {
        signal: ctrl.signal,
        redirect: "manual",
        // UA de navegador: o WAF de alguns sites (ex.: etc-inter.net) devolve 403 para UA de bot.
        headers: { "user-agent": UA_NAVEGADOR, accept: "image/*" },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) return { ok: false, erro: `HTTP ${resp.status} sem Location` };
        if (salto >= MAX_REDIRECTS) return { ok: false, erro: "redirects demais" };
        atual = new URL(location, v.url).toString();
        continue;
      }
      if (!resp.ok) return { ok: false, erro: `HTTP ${resp.status}` };
      const contentType = resp.headers.get("content-type");
      if (!extensaoDeMime(contentType)) return { ok: false, erro: `não é imagem (${(contentType ?? "sem content-type").slice(0, 40)})` };
      const declarado = Number(resp.headers.get("content-length") || "0");
      if (declarado > MIDIA_MAX_BYTES) return { ok: false, erro: "imagem acima de 10 MB" };
      const corpo = await lerComTeto(resp, ctrl);
      if (!Buffer.isBuffer(corpo)) return corpo;
      return { ok: true, dados: { bytes: corpo, contentType: (contentType as string).split(";")[0].trim().toLowerCase() } };
    }
  } catch (err) {
    const msg = err instanceof Error ? (err.name === "AbortError" ? "tempo esgotado" : err.message) : "falha no download";
    return { ok: false, erro: resumirErro(msg) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Processa ate `max` linhas de campus_media do tenant cujo `url` ainda e externo e
 * que nao estouraram o teto de tentativas. `campusIds` restringe aos campi de UM
 * fornecedor (botao do hub); sem ele, roda no tenant inteiro (cron). Para cada uma: baixa, grava no bucket,
 * troca `url` (guardando `source_url`) e propaga para campus.cover_image_url quando a
 * capa era a mesma URL. Falha em uma linha nao derruba as outras.
 */
export async function internalizarMidias(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { max?: number; orcamentoMs?: number; fetchImpl?: typeof fetch; campusIds?: string[] } = {},
): Promise<ResultadoInternalizacao> {
  const max = opts.max ?? 30;
  // Orcamento conservador: a checagem e por linha e um download pode levar TIMEOUT_MS.
  const orcamentoMs = opts.orcamentoMs ?? 35_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const inicio = Date.now();
  const r: ResultadoInternalizacao = { candidatas: 0, internalizadas: 0, capas_atualizadas: 0, falhas: 0, adiadas: 0, interrompida: null, erros: [] };

  // Fila = ainda NAO internalizada, marcada por `source_url is null` (a internalizacao
  // grava url + source_url na mesma operacao). Comparacao por igualdade, nao por LIKE
  // com curinga: o padrao passa por URL/PostgREST e um escape errado zeraria a fila em
  // silencio. `ehUrlInterna` abaixo continua sendo a rede de protecao no resultado.
  // Ordena pelas menos tentadas para uma URL quebrada nao monopolizar a execucao.
  // Escopo opcional por fornecedor: lista vazia = nenhum campus, nao "todos".
  if (opts.campusIds && opts.campusIds.length === 0) return r;
  let q = supabase
    .from("campus_media")
    .select("id, campus_id, url, internalize_attempts")
    .eq("tenant_id", tenantId)
    .eq("kind", "photo") // video/brochura nao sao imagens: nao entram na fila
    .is("source_url", null)
    .lt("internalize_attempts", MIDIA_MAX_TENTATIVAS)
    .order("internalize_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(max);
  if (opts.campusIds) q = q.in("campus_id", opts.campusIds);
  const { data, error } = await q;
  if (error) throw new Error(`campus_media: ${error.message}`);
  const linhas = ((data ?? []) as Linha[]).filter((l) => !ehUrlInterna(l.url, supabaseUrl));
  r.candidatas = linhas.length;

  // A mesma foto aparece em mais de um campus (ex.: LSI): baixa uma vez por execucao.
  const cache = new Map<string, Awaited<ReturnType<typeof baixarImagem>>>();
  // Ritmo por host (ver MIN_INTERVALO_HOST_MS).
  const ultimoPorHost = new Map<string, number>();

  for (const linha of linhas) {
    if (r.interrompida || Date.now() - inicio > orcamentoMs) {
      r.adiadas++;
      continue;
    }
    // So falha da URL DE ORIGEM consome tentativa. Falha nossa (Storage/banco) NAO —
    // senao um bucket fora do ar esgotaria as 5 tentativas de toda a fila em 5 dias.
    const registrarFalha = async (erro: string) => {
      r.falhas++;
      r.erros.push(resumirErro(erro));
      await supabase
        .from("campus_media")
        .update({ internalize_attempts: linha.internalize_attempts + 1, internalize_error: resumirErro(erro) })
        .eq("tenant_id", tenantId)
        .eq("id", linha.id);
    };

    let baixado = cache.get(linha.url);
    if (!baixado) {
      baixado = await baixarImagem(linha.url, fetchImpl, ultimoPorHost);
      cache.set(linha.url, baixado);
    }
    if (!baixado.ok) {
      await registrarFalha(baixado.erro);
      continue;
    }

    const ext = extensaoDeMime(baixado.dados.contentType) as string;
    const caminho = caminhoStorageMidia(linha.campus_id, linha.id, ext);
    const { error: upErr } = await supabase.storage
      .from(BUCKET_MIDIA_CATALOGO)
      .upload(caminho, baixado.dados.bytes, { contentType: baixado.dados.contentType, upsert: true, cacheControl: "31536000" });
    if (upErr) {
      r.interrompida = `storage: ${resumirErro(upErr.message)}`;
      r.adiadas++;
      continue;
    }

    const urlNova = urlPublicaStorage(supabaseUrl, BUCKET_MIDIA_CATALOGO, caminho);
    const { data: upd, error: updErr } = await supabase
      .from("campus_media")
      .update({ url: urlNova, source_url: linha.url, internalize_error: null })
      .eq("tenant_id", tenantId)
      .eq("id", linha.id)
      .eq("url", linha.url) // nao sobrescreve se alguem trocou a URL no meio
      .select("id");
    if (updErr) {
      r.interrompida = `campus_media: ${resumirErro(updErr.message)}`;
      r.adiadas++;
      continue;
    }
    if (!upd || upd.length === 0) continue; // outra execucao ja tratou esta linha
    r.internalizadas++;

    // Capa do campus apontando para a mesma foto: passa a usar a copia interna.
    const { data: capa, error: capaErr } = await supabase
      .from("campus")
      .update({ cover_image_url: urlNova })
      .eq("tenant_id", tenantId)
      .eq("id", linha.campus_id)
      .eq("cover_image_url", linha.url)
      .select("id");
    if (!capaErr && capa && capa.length > 0) r.capas_atualizadas += capa.length;
  }

  return r;
}

/**
 * Quantas fotos ainda estao hospedadas fora (mesma regra da fila). Usado pelo hub
 * para mostrar o que falta e habilitar/desabilitar o botao. `campusIds` vazio = 0.
 */
export async function contarMidiaPendente(
  supabase: SupabaseClient,
  tenantId: string,
  campusIds?: string[],
): Promise<{ pendentes: number; esgotadas: number }> {
  if (campusIds && campusIds.length === 0) return { pendentes: 0, esgotadas: 0 };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  let q = supabase
    .from("campus_media")
    .select("url, internalize_attempts")
    .eq("tenant_id", tenantId)
    .eq("kind", "photo")
    .is("source_url", null);
  if (campusIds) q = q.in("campus_id", campusIds);
  const { data, error } = await q;
  if (error) throw new Error(`campus_media: ${error.message}`);

  // MESMA regra da fila: `source_url is null` sozinho nao basta. A aprovacao de
  // conteudo da escola reinsere as midias do campus e perde o source_url, entao ha
  // linhas ja hospedadas no nosso Storage com source_url nulo — elas NAO sao
  // pendentes, e conta-las mostraria um aviso falso e um botao que nao faz nada.
  let pendentes = 0;
  let esgotadas = 0;
  for (const linha of (data ?? []) as { url: string; internalize_attempts: number }[]) {
    if (ehUrlInterna(linha.url, supabaseUrl)) continue;
    if (linha.internalize_attempts >= MIDIA_MAX_TENTATIVAS) esgotadas++;
    else pendentes++;
  }
  return { pendentes, esgotadas };
}

// ---------------------------------------------------------------------------
// Favicon da escola
// ---------------------------------------------------------------------------
// Mesmo motivo das fotos: o CSP do portal publico tem `img-src` restrito a
// *.supabase.co, entao um favicon hospedado no site da escola simplesmente NAO
// renderiza — a proposta esconde o <img> quebrado e o icone nunca aparece. Por
// isso o favicon tambem e copiado para o nosso bucket.
//
// A URL de origem fica em supplier.favicon_source_url (procedencia e retry) e as
// tentativas em favicon_internalize_attempts, pelo mesmo motivo de campus_media:
// sem teto, uma URL quebrada volta para a fila todo dia, para sempre, batendo no
// site de terceiro.

export const FAVICON_MAX_TENTATIVAS = 5;

export type ResultadoFavicon = { ok: true; url: string; origem: string } | { ok: false; erro: string };

/**
 * Baixa o favicon de UMA escola e grava no bucket, devolvendo a URL interna.
 * Nao escreve na tabela: quem chama decide quando gravar. URL ja interna volta
 * como sucesso, sem baixar de novo.
 *
 * `tenantId` e obrigatorio e e conferido aqui: a funcao escreve num caminho
 * derivado do supplierId, e quem chama nao deve poder passar um id de outro
 * tenant por engano (toda autorizacao neste projeto e feita em codigo).
 */
export async function internalizarFavicon(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  faviconUrl: string,
  opts: { fetchImpl?: typeof fetch; ultimoPorHost?: Map<string, number> } = {},
): Promise<ResultadoFavicon> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  if (ehUrlInterna(faviconUrl, supabaseUrl)) return { ok: true, url: faviconUrl, origem: faviconUrl };

  const { data: dono, error: donoErr } = await supabase
    .from("supplier")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", supplierId)
    .maybeSingle();
  if (donoErr) return { ok: false, erro: `fornecedor: ${resumirErro(donoErr.message)}` };
  if (!dono) return { ok: false, erro: "fornecedor nao e deste tenant" };

  const baixado = await baixarImagem(faviconUrl, opts.fetchImpl ?? fetch, opts.ultimoPorHost);
  if (!baixado.ok) return baixado;
  const bytes = baixado.dados.bytes;
  // Arquivo de 0 byte passa pelo HTTP 200 (ja aconteceu com uma escola) e viraria
  // um icone quebrado no lugar de nenhum icone.
  if (bytes.length === 0) return { ok: false, erro: "arquivo vazio" };
  if (bytes.length > FAVICON_MAX_BYTES) return { ok: false, erro: "icone acima de 512 KB" };

  // O tipo vem dos BYTES, nao do header do site da escola: o arquivo passa a ser
  // servido sob o nosso dominio, entao quem declara o que ele e somos nos.
  const mime = formatoDeImagem(bytes);
  if (!mime) return { ok: false, erro: "conteudo nao e uma imagem reconhecida" };
  const ext = extensaoDeMime(mime) as string;

  const { createHash } = await import("node:crypto");
  const impressao = createHash("sha256").update(bytes).digest("hex");
  const caminho = caminhoStorageFavicon(supplierId, impressao, ext);
  const { error: upErr } = await supabase.storage
    .from(BUCKET_MIDIA_CATALOGO)
    .upload(caminho, bytes, { contentType: mime, upsert: true, cacheControl: "31536000" });
  if (upErr) return { ok: false, erro: `storage: ${resumirErro(upErr.message)}` };

  return { ok: true, url: urlPublicaStorage(supabaseUrl, BUCKET_MIDIA_CATALOGO, caminho), origem: faviconUrl };
}

/**
 * Remove a copia anterior do favicon. Best-effort: falhar aqui so deixa um objeto
 * orfao no bucket, nunca invalida a troca que acabou de dar certo.
 */
export async function apagarFaviconAntigo(supabase: SupabaseClient, urlAntiga: string | null, urlNova: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  if (!urlAntiga || urlAntiga === urlNova || !ehUrlInterna(urlAntiga, supabaseUrl)) return;
  const marca = `/object/public/${BUCKET_MIDIA_CATALOGO}/`;
  const i = urlAntiga.indexOf(marca);
  if (i < 0) return;
  const caminho = urlAntiga.slice(i + marca.length);
  if (!caminho.startsWith("fornecedor/")) return; // so mexe em favicon
  try {
    await supabase.storage.from(BUCKET_MIDIA_CATALOGO).remove([caminho]);
  } catch {
    /* orfao no bucket e menos grave do que derrubar a troca */
  }
}

export type ResultadoFavicons = { candidatos: number; internalizados: number; falhas: number; esgotados: number; erros: string[] };

/**
 * Passa pelos fornecedores do tenant cujo favicon ainda esta hospedado fora e
 * troca pela copia interna. Falha em um nao derruba os outros — a escola fica
 * sem icone (o bloco da escola ja trata a ausencia), nunca com icone quebrado.
 *
 * A lista de fornecedores e LIDA INTEIRA (sao dezenas) e so depois recortada: um
 * `limit` na consulta poderia devolver so fornecedores ja internalizados e as
 * pendencias nunca seriam processadas, em silencio.
 */
export async function internalizarFavicons(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { max?: number; orcamentoMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoFavicons> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const max = opts.max ?? 10;
  const orcamentoMs = opts.orcamentoMs ?? 15_000;
  const inicio = Date.now();
  const r: ResultadoFavicons = { candidatos: 0, internalizados: 0, falhas: 0, esgotados: 0, erros: [] };

  const PAGINA = 500;
  const linhas: { id: string; favicon_url: string; favicon_internalize_attempts: number }[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("supplier")
      .select("id, favicon_url, favicon_internalize_attempts")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .not("favicon_url", "is", null)
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`supplier: ${error.message}`);
    const lote = (data ?? []) as typeof linhas;
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  const pendentes = linhas.filter((s) => !ehUrlInterna(s.favicon_url, supabaseUrl));
  r.esgotados = pendentes.filter((s) => (s.favicon_internalize_attempts ?? 0) >= FAVICON_MAX_TENTATIVAS).length;
  // Menos tentados primeiro: uma URL quebrada nao monopoliza a execucao.
  const fila = pendentes
    .filter((s) => (s.favicon_internalize_attempts ?? 0) < FAVICON_MAX_TENTATIVAS)
    .sort((a, b) => (a.favicon_internalize_attempts ?? 0) - (b.favicon_internalize_attempts ?? 0))
    .slice(0, max);
  r.candidatos = fila.length;

  const ultimoPorHost = new Map<string, number>();
  for (const s of fila) {
    // Orcamento de tempo: a rota do cron tem maxDuration e um punhado de sites
    // fora do ar consome 15 s cada. Estourar mataria a funcao inteira.
    if (Date.now() - inicio > orcamentoMs) break;
    const res = await internalizarFavicon(supabase, tenantId, s.id, s.favicon_url, {
      fetchImpl: opts.fetchImpl,
      ultimoPorHost,
    });
    if (!res.ok) {
      r.falhas++;
      r.erros.push(resumirErro(res.erro));
      await supabase
        .from("supplier")
        .update({
          favicon_internalize_attempts: (s.favicon_internalize_attempts ?? 0) + 1,
          favicon_internalize_error: resumirErro(res.erro),
        })
        .eq("tenant_id", tenantId)
        .eq("id", s.id);
      continue;
    }
    const { data: upd, error: updErr } = await supabase
      .from("supplier")
      .update({
        favicon_url: res.url,
        favicon_source_url: res.origem,
        favicon_internalize_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", s.id)
      .eq("favicon_url", s.favicon_url) // nao sobrescreve troca feita no meio
      .select("id");
    if (updErr || !upd || upd.length === 0) {
      r.falhas++;
      if (updErr) r.erros.push(resumirErro(updErr.message));
      continue;
    }
    r.internalizados++;
  }
  return r;
}
