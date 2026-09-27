import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { bad, fail, okData } from "@/lib/catalog-route";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/fornecedor/instituicao — grava a apresentacao/contato da
// INSTITUICAO como um todo (colunas supplier.about/contact_*/hq_*), editado
// pela propria escola. Mesmo padrao de decisao da tela "Marca"
// (api/fornecedor/marca): metadado de apresentacao/contato, sem fluxo de
// aprovacao — grava e ja reflete. Diferente de campus (tela "Escolas"), pois
// aqui e um so registro por FORNECEDOR, compartilhado entre todos os campi.
//
// Ficam FORA do alcance desta rota os campos de controle interno da EXP Tour
// sobre o relacionamento comercial: legal_name, internal_notes,
// relationship_status, is_preferred, verified_at, owner_user_id. A rota nunca
// le nem grava essas colunas.
//
// Body: { about, contactName, contactEmail, contactPhone, hqAddress, hqCity, hqCountryCode }
const MAX_ABOUT = 2000;
const MAX_CURTO = 200;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textoOuNulo(v: unknown, max: number): { ok: true; valor: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, valor: null };
  if (typeof v !== "string") return { ok: false };
  const s = v.trim();
  if (s === "") return { ok: true, valor: null };
  if (s.length > max) return { ok: false };
  return { ok: true, valor: s };
}

export async function PUT(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return bad("Não autenticado.", "nao_autenticado", 401);

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON inválido.");

  const about = textoOuNulo(b.about, MAX_ABOUT);
  if (!about.ok) return bad(`A descrição pode ter no máximo ${MAX_ABOUT} caracteres.`);

  const contactName = textoOuNulo(b.contactName, MAX_CURTO);
  if (!contactName.ok) return bad(`O nome do contato pode ter no máximo ${MAX_CURTO} caracteres.`);

  const contactEmailBruto = textoOuNulo(b.contactEmail, MAX_CURTO);
  if (!contactEmailBruto.ok) return bad(`O e-mail de contato pode ter no máximo ${MAX_CURTO} caracteres.`);
  if (contactEmailBruto.valor && !REGEX_EMAIL.test(contactEmailBruto.valor)) {
    return bad("E-mail de contato inválido.");
  }

  const contactPhoneBruto = textoOuNulo(b.contactPhone, MAX_CURTO);
  if (!contactPhoneBruto.ok) return bad(`O telefone de contato pode ter no máximo ${MAX_CURTO} caracteres.`);
  // Sanitiza: mantem apenas digitos, espaco, +, -, (, ) — sem impor formato de pais.
  const contactPhone = contactPhoneBruto.valor
    ? contactPhoneBruto.valor.replace(/[^\d+\-() ]/g, "").trim() || null
    : null;

  const hqAddress = textoOuNulo(b.hqAddress, MAX_CURTO);
  if (!hqAddress.ok) return bad(`O endereço pode ter no máximo ${MAX_CURTO} caracteres.`);

  const hqCity = textoOuNulo(b.hqCity, MAX_CURTO);
  if (!hqCity.ok) return bad(`A cidade pode ter no máximo ${MAX_CURTO} caracteres.`);

  const hqCountryRaw = typeof b.hqCountryCode === "string" ? b.hqCountryCode.trim().toUpperCase() : "";
  if (hqCountryRaw !== "" && !/^[A-Z]{2}$/.test(hqCountryRaw)) {
    return bad("Use o código do país com 2 letras (ex.: CA, IE, AU).");
  }
  const hqCountryCode = hqCountryRaw === "" ? null : hqCountryRaw;

  try {
    const supabase = getServiceClient();
    const tenantId = await tenantIdAtual(supabase);
    const supplierId = sessao.supplierId;

    // Posse: sempre pelo supplier_id da sessão — nunca por um id vindo do corpo.
    const { data: fornecedor, error: fErr } = await supabase
      .from("supplier")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", supplierId)
      .maybeSingle();
    if (fErr) throw new Error(`Falha ao carregar fornecedor: ${fErr.message}`);
    if (!fornecedor) return bad("Fornecedor não encontrado.", "nao_encontrado", 404);

    if (!(await checarELimitar(supabase, `fornecedor-instituicao:${supplierId}`, 30, 600, Date.now(), true))) {
      return bad("Muitas tentativas em pouco tempo. Aguarde alguns minutos.", "rate_limit", 429);
    }

    const { error: updErr } = await supabase
      .from("supplier")
      .update({
        about: about.valor,
        contact_name: contactName.valor,
        contact_email: contactEmailBruto.valor,
        contact_phone: contactPhone,
        hq_address: hqAddress.valor,
        hq_city: hqCity.valor,
        hq_country_code: hqCountryCode,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", supplierId);
    if (updErr) throw new Error(`Falha ao gravar dados da instituição: ${updErr.message}`);

    return okData({
      about: about.valor,
      contactName: contactName.valor,
      contactEmail: contactEmailBruto.valor,
      contactPhone,
      hqAddress: hqAddress.valor,
      hqCity: hqCity.valor,
      hqCountryCode,
    });
  } catch (err) {
    return fail(err);
  }
}
