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
  caminhoStorageMidia,
  ehUrlInterna,
  extensaoDeMime,
  ipEhPrivado,
  resumirErro,
  urlPublicaStorage,
  validarUrlExterna,
} from "@/lib/midia-internalizacao";

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
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
export async function baixarImagem(url: string, fetchImpl: typeof fetch): Promise<{ ok: true; dados: Baixado } | Falha> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let atual = url;
    for (let salto = 0; ; salto++) {
      const v = validarUrlExterna(atual);
      if (!v.ok) return salto === 0 ? v : { ok: false, erro: `redirect recusado: ${v.erro}` };
      const dns = await hostResolvePublico(v.url.hostname);
      if (dns) return dns;

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
 * que nao estouraram o teto de tentativas. Para cada uma: baixa, grava no bucket,
 * troca `url` (guardando `source_url`) e propaga para campus.cover_image_url quando a
 * capa era a mesma URL. Falha em uma linha nao derruba as outras.
 */
export async function internalizarMidias(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { max?: number; orcamentoMs?: number; fetchImpl?: typeof fetch } = {},
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
  const { data, error } = await supabase
    .from("campus_media")
    .select("id, campus_id, url, internalize_attempts")
    .eq("tenant_id", tenantId)
    .eq("kind", "photo") // video/brochura nao sao imagens: nao entram na fila
    .is("source_url", null)
    .lt("internalize_attempts", MIDIA_MAX_TENTATIVAS)
    .order("internalize_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(max);
  if (error) throw new Error(`campus_media: ${error.message}`);
  const linhas = ((data ?? []) as Linha[]).filter((l) => !ehUrlInterna(l.url, supabaseUrl));
  r.candidatas = linhas.length;

  // A mesma foto aparece em mais de um campus (ex.: LSI): baixa uma vez por execucao.
  const cache = new Map<string, Awaited<ReturnType<typeof baixarImagem>>>();

  for (const linha of linhas) {
    if (r.interrompida || Date.now() - inicio > orcamentoMs) {
      r.adiadas++;
      continue;
    }
    // So falha da URL DE ORIGEM consome tentativa. Falha nossa (Storage/banco) NAO —
    // senao um bucket fora do ar esgotaria as 5 tentativas de toda a fila em 5 dias.
    const registrarFalha = async (erro: string) => {
      r.falhas++;
      r.erros.push(erro);
      await supabase
        .from("campus_media")
        .update({ internalize_attempts: linha.internalize_attempts + 1, internalize_error: resumirErro(erro) })
        .eq("tenant_id", tenantId)
        .eq("id", linha.id);
    };

    let baixado = cache.get(linha.url);
    if (!baixado) {
      baixado = await baixarImagem(linha.url, fetchImpl);
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
