import { tenantIdAtual } from "@/lib/catalog-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { REDES, urlDaRede, urlFavicon, type LinkSocial, type Rede } from "@/lib/redes-sociais";
import { getSupabase, guardCatalogWrite, bad, fail, okData, isUuid } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return bad("Favicon invalido: use uma URL http:// ou https://.");
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
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (fErr) throw new Error(`Falha ao carregar fornecedor: ${fErr.message}`);
    if (!fornecedor) return bad("Fornecedor nao encontrado para este tenant.", "nao_encontrado", 404);

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

    await registrarAuditoriaAdmin(supabase, {
      usuario: g.usuario,
      acao: "supplier.marca.set",
      alvo: id,
      detalhe: { favicon: !!faviconUrl, redes: social.map((r) => r.rede) },
      ip: g.ip ?? null,
    });

    return okData({ faviconUrl, social });
  } catch (err) {
    return fail(err);
  }
}
