import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { bad, fail, okData } from "@/lib/catalog-route";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/fornecedor/campus-info — grava endereco/contato do CAMPUS
// (colunas campus.address/postal_code/city/region/phone/email/website),
// editado pelo proprio fornecedor. Mesmo padrao de decisao da tela "Marca"
// (api/fornecedor/marca): e metadado operacional de contato/localizacao, nao
// conteudo comercial que precise de revisao editorial — por isso a gravacao e
// DIRETA, fora do fluxo rascunho->aprovacao de campus_content_submission.
// Campos estruturais do campus (name/status/country_code/base_currency/
// timezone/latitude/longitude) NAO entram aqui: afetam o motor de preco/
// cambio e continuam admin-only (CampusEditor.tsx).
//
// Posse: sempre pelo supplier_id da sessao, nunca por um id vindo do corpo —
// campusId so e aceito depois de confirmar que pertence a esse fornecedor
// (e ao tenant atual).
//
// Body: { campusId, address?, postal_code?, city?, region?, phone?, email?, website? }
export async function PUT(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return bad("Não autenticado.", "nao_autenticado", 401);

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON inválido.");

  const campusId = typeof b.campusId === "string" ? b.campusId.trim() : "";
  if (!campusId) return bad("Campus não informado.");

  // Strings simples (endereco/telefone/etc.): trim, vazio vira null, limite de tamanho.
  function optStr(raw: unknown, max: number): { ok: true; valor: string | null } | { ok: false; erro: string } {
    if (raw === undefined || raw === null) return { ok: true, valor: null };
    if (typeof raw !== "string") return { ok: false, erro: "texto inválido" };
    const s = raw.trim();
    if (!s) return { ok: true, valor: null };
    if (s.length > max) return { ok: false, erro: `no máximo ${max} caracteres` };
    return { ok: true, valor: s };
  }

  const rAddress = optStr(b.address, 300);
  if (!rAddress.ok) return bad(`Endereço: ${rAddress.erro}.`);
  const rPostalCode = optStr(b.postal_code, 32);
  if (!rPostalCode.ok) return bad(`CEP: ${rPostalCode.erro}.`);
  // Cidade e NOT NULL no schema (campus.city) — diferente dos demais campos
  // desta rota, nao pode virar null. Exige texto nao-vazio, como no motor
  // validarCampus (lib/campus.ts) usado pelo admin.
  const cidadeBruta = typeof b.city === "string" ? b.city.trim() : "";
  if (!cidadeBruta) return bad("Cidade: obrigatório.");
  if (cidadeBruta.length > 200) return bad("Cidade: no máximo 200 caracteres.");
  const rCity = { ok: true as const, valor: cidadeBruta };
  const rRegion = optStr(b.region, 120);
  if (!rRegion.ok) return bad(`Região: ${rRegion.erro}.`);
  const rPhone = optStr(b.phone, 40);
  if (!rPhone.ok) return bad(`Telefone: ${rPhone.erro}.`);

  const rEmail = optStr(b.email, 200);
  if (!rEmail.ok) return bad(`E-mail: ${rEmail.erro}.`);
  const email = rEmail.valor;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad("E-mail inválido.");
  }

  const rWebsite = optStr(b.website, 300);
  if (!rWebsite.ok) return bad(`Site: ${rWebsite.erro}.`);
  let website = rWebsite.valor;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website) {
    try {
      new URL(website);
    } catch {
      return bad("Site inválido: use uma URL válida (ex.: https://minhaescola.com).");
    }
  }

  try {
    const supabase = getServiceClient();
    const tenantId = await tenantIdAtual(supabase);
    const supplierId = sessao.supplierId;

    // Posse: o campus precisa pertencer a este fornecedor e ao tenant atual.
    const { data: campus, error: cErr } = await supabase
      .from("campus")
      .select("id, supplier_id")
      .eq("tenant_id", tenantId)
      .eq("id", campusId)
      .maybeSingle();
    if (cErr) throw new Error(`Falha ao carregar campus: ${cErr.message}`);
    if (!campus || (campus as any).supplier_id !== supplierId) {
      return bad("Campus não encontrado.", "nao_encontrado", 404);
    }

    if (!(await checarELimitar(supabase, `fornecedor-campus-info:${supplierId}`, 30, 600, Date.now(), true))) {
      return bad("Muitas tentativas em pouco tempo. Aguarde alguns minutos.", "rate_limit", 429);
    }

    const patch = {
      address: rAddress.valor,
      postal_code: rPostalCode.valor,
      city: rCity.valor,
      region: rRegion.valor,
      phone: rPhone.valor,
      email: email ? email.toLowerCase() : null,
      website,
      updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabase
      .from("campus")
      .update(patch)
      .eq("tenant_id", tenantId)
      .eq("id", campusId)
      .eq("supplier_id", supplierId);
    if (updErr) throw new Error(`Falha ao gravar endereço/contato do campus: ${updErr.message}`);

    return okData({
      address: patch.address,
      postal_code: patch.postal_code,
      city: patch.city,
      region: patch.region,
      phone: patch.phone,
      email: patch.email,
      website: patch.website,
    });
  } catch (err) {
    return fail(err);
  }
}
