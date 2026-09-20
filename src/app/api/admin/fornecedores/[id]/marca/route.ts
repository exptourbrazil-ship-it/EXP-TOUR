import { tenantIdAtual } from "@/lib/catalog-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { REDES, urlDaRede, urlFavicon, type LinkSocial, type Rede } from "@/lib/redes-sociais";
import { apagarFaviconAntigo, internalizarFavicon } from "@/lib/midia-internalizacao-service";
import { ehUrlInterna } from "@/lib/midia-internalizacao";
import { getSupabase, guardCatalogWrite, bad, fail, okData, isUuid } from "@/lib/catalog-route";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O salvamento tenta baixar o favicon do site da escola (timeout de 15 s).
export const maxDuration = 30;

// PUT /api/admin/fornecedores/[id]/marca — grava favicon e redes sociais da
// ESCOLA. Os dois viram elemento clicável na proposta pública do estudante,
// por isso a validação é por rede (host tem de bater) e não só "é uma URL".
//
// Body: { faviconUrl: string|null, social: [{ rede, url }] }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de fornecedor invalido.");

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  // Favicon: vazio limpa o campo.
  const faviconBruto = typeof b.faviconUrl === "string" ? b.faviconUrl.trim() : "";
  const faviconUrl = faviconBruto === "" ? null : urlFavicon(faviconBruto);
  if (faviconBruto !== "" && !faviconUrl) {
    return bad("Favicon invalido: use uma URL https://.");
  }
  // So https: o icone precisa ser copiado para o nosso Storage (o CSP do portal
  // bloqueia imagem de fora) e a copia recusa origem sem TLS. Aceitar http aqui
  // gravaria um icone que nunca apareceria na proposta.
  if (faviconUrl && new URL(faviconUrl).protocol !== "https:") {
    return bad("Favicon invalido: o endereco precisa comecar com https://.");
  }

  // Redes: recusa a linha inteira quando a URL nao e da rede indicada. Aceitar
  // em silencio colocaria o icone do Instagram apontando para outro lugar na
  // proposta do cliente.
  const socialBruto = Array.isArray(b.social) ? b.social : [];
  const social: LinkSocial[] = [];
  const vistas = new Set<Rede>();
  for (const item of socialBruto) {
    if (!item || typeof item !== "object") continue;
    const rede = (item as any).rede;
    if (!REDES.includes(rede)) return bad(`Rede desconhecida: ${String(rede)}.`);
    const bruta = typeof (item as any).url === "string" ? (item as any).url.trim() : "";
    if (bruta === "") continue; // linha vazia = rede nao informada
    const url = urlDaRede(rede, bruta);
    if (!url) {
      return bad(`O endereco informado para ${rede} nao e um perfil de ${rede}.`);
    }
    if (vistas.has(rede)) return bad(`Rede repetida: ${rede}.`);
    vistas.add(rede);
    social.push({ rede, url });
  }

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);

    // Posse: o fornecedor tem de ser deste tenant.
    const { data: fornecedor, error: fErr } = await supabase
      .from("supplier")
      .select("id, favicon_url")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (fErr) throw new Error(`Falha ao carregar fornecedor: ${fErr.message}`);
    if (!fornecedor) return bad("Fornecedor nao encontrado para este tenant.", "nao_encontrado", 404);
    const faviconAnterior = (fornecedor.favicon_url as string | null) ?? null;

    // Este PUT busca uma URL escolhida pelo admin na rede publica. Sem teto, a
    // tela vira sonda de hosts (a mensagem de erro diferencia 403, timeout e
    // "nao e imagem"). Falha FECHADA, como na rota irma de midia.
    if (faviconUrl && !(await checarELimitar(supabase, `admin-marca-favicon:${g.usuario}`, 30, 600, Date.now(), true))) {
      return bad("Muitas tentativas de icone em pouco tempo. Aguarde alguns minutos.", "rate_limit", 429);
    }

    const { error: updErr } = await supabase
      .from("supplier")
      .update({
        favicon_url: faviconUrl,
        social: social.length > 0 ? social : null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    if (updErr) throw new Error(`Falha ao gravar marca do fornecedor: ${updErr.message}`);

    // So DEPOIS de gravar: o CSP do portal publico so aceita imagem de
    // *.supabase.co, entao o icone hospedado no site da escola nao renderiza e
    // precisa virar copia nossa. A copia vem depois de proposito — se o site da
    // escola estiver fora, o admin nao perde as redes que acabou de digitar; o
    // cron diario tenta de novo.
    let faviconFinal = faviconUrl;
    let avisoFavicon: string | null = null;
    if (faviconUrl && !ehUrlInterna(faviconUrl, process.env.NEXT_PUBLIC_SUPABASE_URL as string)) {
      const interno = await internalizarFavicon(supabase, tenantId, id, faviconUrl);
      if (interno.ok) {
        const { data: trocado } = await supabase
          .from("supplier")
          .update({
            favicon_url: interno.url,
            favicon_source_url: interno.origem,
            favicon_internalize_attempts: 0,
            favicon_internalize_error: null,
          })
          .eq("tenant_id", tenantId)
          .eq("id", id)
          .eq("favicon_url", faviconUrl)
          .select("id");
        if (trocado && trocado.length > 0) {
          faviconFinal = interno.url;
          await apagarFaviconAntigo(supabase, faviconAnterior, interno.url);
        }
      } else {
        avisoFavicon = `O icone nao pode ser copiado (${interno.erro}). Ele so aparecera na proposta apos uma nova tentativa.`;
        await supabase
          .from("supplier")
          .update({ favicon_internalize_error: interno.erro })
          .eq("tenant_id", tenantId)
          .eq("id", id);
      }
    }

    await registrarAuditoriaAdmin(supabase, {
      usuario: g.usuario,
      acao: "supplier.marca.set",
      alvo: id,
      detalhe: {
        favicon: !!faviconFinal,
        favicon_interno: !!faviconFinal && ehUrlInterna(faviconFinal, process.env.NEXT_PUBLIC_SUPABASE_URL as string),
        redes: social.map((r) => r.rede),
      },
      ip: g.ip ?? null,
    });

    return okData({ faviconUrl: faviconFinal, social, aviso: avisoFavicon });
  } catch (err) {
    return fail(err);
  }
}
