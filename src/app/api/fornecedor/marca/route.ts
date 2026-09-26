import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { REDES, urlDaRede, urlFavicon, type LinkSocial, type Rede } from "@/lib/redes-sociais";
import { apagarFaviconAntigo, internalizarFavicon } from "@/lib/midia-internalizacao-service";
import { ehUrlInterna } from "@/lib/midia-internalizacao";
import { bad, fail, okData } from "@/lib/catalog-route";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Igual à rota irmã do admin: o salvamento tenta baixar o favicon do site (timeout).
export const maxDuration = 30;

// PUT /api/fornecedor/marca — grava favicon e redes sociais do FORNECEDOR
// (colunas supplier.favicon_url / supplier.social), editado pela própria
// escola. Sem fluxo de aprovação: é metadado de contato/branding (não
// conteúdo comercial), e social/favicon são por FORNECEDOR — um fornecedor
// com vários campi tem um só, compartilhado entre eles — por isso a tela
// não é por campus, e a gravação é direta (grava e já reflete). A validação
// e a internalização do favicon são as MESMAS da rota do admin
// (api/admin/fornecedores/[id]/marca): host precisa bater com a rede, e o
// favicon vira cópia no nosso Storage porque o CSP do portal público recusa
// imagem externa.
//
// Body: { faviconUrl: string|null, social: [{ rede, url }] }
export async function PUT(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return bad("Não autenticado.", "nao_autenticado", 401);

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON inválido.");

  const faviconBruto = typeof b.faviconUrl === "string" ? b.faviconUrl.trim() : "";
  const faviconUrl = faviconBruto === "" ? null : urlFavicon(faviconBruto);
  if (faviconBruto !== "" && !faviconUrl) {
    return bad("Favicon inválido: use uma URL https://.");
  }
  if (faviconUrl && new URL(faviconUrl).protocol !== "https:") {
    return bad("Favicon inválido: o endereço precisa começar com https://.");
  }

  const socialBruto = Array.isArray(b.social) ? b.social : [];
  const social: LinkSocial[] = [];
  const vistas = new Set<Rede>();
  for (const item of socialBruto) {
    if (!item || typeof item !== "object") continue;
    const rede = (item as any).rede;
    if (!REDES.includes(rede)) return bad(`Rede desconhecida: ${String(rede)}.`);
    const bruta = typeof (item as any).url === "string" ? (item as any).url.trim() : "";
    if (bruta === "") continue;
    const url = urlDaRede(rede, bruta);
    if (!url) return bad(`O endereço informado para ${rede} não é um perfil de ${rede}.`);
    if (vistas.has(rede)) return bad(`Rede repetida: ${rede}.`);
    vistas.add(rede);
    social.push({ rede, url });
  }

  try {
    const supabase = getServiceClient();
    const tenantId = await tenantIdAtual(supabase);
    const supplierId = sessao.supplierId;

    // Posse: sempre pelo supplier_id da sessão — nunca por um id vindo do corpo.
    const { data: fornecedor, error: fErr } = await supabase
      .from("supplier")
      .select("id, favicon_url")
      .eq("tenant_id", tenantId)
      .eq("id", supplierId)
      .maybeSingle();
    if (fErr) throw new Error(`Falha ao carregar fornecedor: ${fErr.message}`);
    if (!fornecedor) return bad("Fornecedor não encontrado.", "nao_encontrado", 404);
    const faviconAnterior = (fornecedor.favicon_url as string | null) ?? null;

    if (faviconUrl && !(await checarELimitar(supabase, `fornecedor-marca-favicon:${supplierId}`, 30, 600, Date.now(), true))) {
      return bad("Muitas tentativas de ícone em pouco tempo. Aguarde alguns minutos.", "rate_limit", 429);
    }

    const { error: updErr } = await supabase
      .from("supplier")
      .update({
        favicon_url: faviconUrl,
        social: social.length > 0 ? social : null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", supplierId);
    if (updErr) throw new Error(`Falha ao gravar marca do fornecedor: ${updErr.message}`);

    let faviconFinal = faviconUrl;
    let avisoFavicon: string | null = null;
    if (faviconUrl && !ehUrlInterna(faviconUrl, process.env.NEXT_PUBLIC_SUPABASE_URL as string)) {
      const interno = await internalizarFavicon(supabase, tenantId, supplierId, faviconUrl);
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
          .eq("id", supplierId)
          .eq("favicon_url", faviconUrl)
          .select("id");
        if (trocado && trocado.length > 0) {
          faviconFinal = interno.url;
          await apagarFaviconAntigo(supabase, faviconAnterior, interno.url);
        }
      } else {
        avisoFavicon = `O ícone não pode ser copiado (${interno.erro}). Ele só aparecerá na proposta após uma nova tentativa.`;
        await supabase
          .from("supplier")
          .update({ favicon_internalize_error: interno.erro })
          .eq("tenant_id", tenantId)
          .eq("id", supplierId);
      }
    }

    return okData({ faviconUrl: faviconFinal, social, aviso: avisoFavicon });
  } catch (err) {
    return fail(err);
  }
}
