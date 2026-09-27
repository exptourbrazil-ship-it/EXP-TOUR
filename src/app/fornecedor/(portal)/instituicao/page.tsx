import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { textosInstituicaoFornecedor } from "@/lib/fornecedor-i18n";
import InstituicaoFornecedorEditor from "./InstituicaoFornecedorEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tela "Sobre a instituição" do Portal do Fornecedor: about/contato/endereço
// de `supplier.about|contact_*|hq_*` — nível SUPPLIER (não campus), mesmo
// padrão de decisão da tela "Marca" (edição direta, sem aprovação). Os
// campos de controle interno da EXP Tour (legal_name, internal_notes,
// relationship_status, is_preferred, verified_at, owner_user_id) não são
// lidos aqui.
export default async function InstituicaoFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/instituicao");
  const supabase = getServiceClient();
  const T = textosInstituicaoFornecedor(sessao.language);

  const { data: supplier, error } = await supabase
    .from("supplier")
    .select("about, contact_name, contact_email, contact_phone, hq_address, hq_city, hq_country_code")
    .eq("id", sessao.supplierId)
    .maybeSingle();

  if (error) {
    return <p style={{ color: "#b91c1c", fontSize: 14 }}>{T.erroCarregar}</p>;
  }

  return (
    <div>
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
