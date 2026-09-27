import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { parseRedes, urlFavicon } from "@/lib/redes-sociais";
import { textosInstituicaoFornecedor } from "@/lib/fornecedor-i18n";
import MarcaFornecedorEditor from "../marca/MarcaFornecedorEditor";
import InstituicaoFornecedorEditor from "./InstituicaoFornecedorEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tela única "Sobre a instituição" do Portal do Fornecedor — dados do
// FORNECEDOR como um todo (não por campus), sem fluxo de aprovação (edição
// direta): favicon/logo/redes de `supplier.favicon_url|logo_url|social` +
// about/contato/endereço de `supplier.about|contact_*|hq_*`. Antes eram duas
// telas separadas ("Marca" em /fornecedor/marca e "Sobre a instituição" em
// /fornecedor/instituicao); unificadas aqui em duas seções claras porque, na
// prática, eram os mesmos dados do fornecedor — a rota /fornecedor/marca
// agora só redireciona para cá (ver marca/page.tsx). Os campos de controle
// interno da EXP Tour (legal_name, internal_notes, relationship_status,
// is_preferred, verified_at, owner_user_id) não são lidos aqui.
export default async function InstituicaoFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/instituicao");
  const supabase = getServiceClient();
  const T = textosInstituicaoFornecedor(sessao.language);

  const { data: supplier, error } = await supabase
    .from("supplier")
    .select(
      "favicon_url, logo_url, social, about, contact_name, contact_email, contact_phone, hq_address, hq_city, hq_country_code",
    )
    .eq("id", sessao.supplierId)
    .maybeSingle();

  if (error) {
    return <p style={{ color: "#b91c1c", fontSize: 14 }}>{T.erroCarregar}</p>;
  }

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        {sessao.language === "pt" ? "Sobre a instituição" : "About the institution"}
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {sessao.language === "pt"
          ? "Dados do fornecedor como um todo — ícone, logo, redes sociais, apresentação e contato principal. Diferente da tela \"Campus\", que é por unidade."
          : "Data for the supplier as a whole — icon, logo, social links, presentation and main contact. Different from the \"Campus\" screen, which is per unit."}
      </p>

      <MarcaFornecedorEditor
        idioma={sessao.language}
        inicial={{
          faviconUrl: urlFavicon(supplier?.favicon_url),
          logoUrl: supplier?.logo_url ?? null,
          social: parseRedes(supplier?.social),
        }}
      />

      <InstituicaoFornecedorEditor
        idioma={sessao.language}
        inicial={{
          about: supplier?.about ?? "",
          contactName: supplier?.contact_name ?? "",
          contactEmail: supplier?.contact_email ?? "",
          contactPhone: supplier?.contact_phone ?? "",
          hqAddress: supplier?.hq_address ?? "",
          hqCity: supplier?.hq_city ?? "",
          hqCountryCode: supplier?.hq_country_code ?? "",
        }}
      />
    </div>
  );
}
