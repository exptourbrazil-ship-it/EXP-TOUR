import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { parseRedes, urlFavicon } from "@/lib/redes-sociais";
import { textosMarcaFornecedor } from "@/lib/fornecedor-i18n";
import MarcaFornecedorEditor from "./MarcaFornecedorEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tela "Marca" do Portal do Fornecedor: favicon + redes sociais de
// `supplier.favicon_url`/`supplier.social` — hoje só editados pelo admin.
// Única (não por campus): as duas colunas são do FORNECEDOR, compartilhadas
// por todos os campi da escola.
export default async function MarcaFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/marca");
  const supabase = getServiceClient();
  const T = textosMarcaFornecedor(sessao.language);

  const { data: supplier, error } = await supabase
    .from("supplier")
    .select("favicon_url, social")
    .eq("id", sessao.supplierId)
    .maybeSingle();

  if (error) {
    return <p style={{ color: "#b91c1c", fontSize: 14 }}>{T.erroCarregar}</p>;
  }

  return (
    <div>
      <MarcaFornecedorEditor
        idioma={sessao.language}
        inicial={{
          faviconUrl: urlFavicon(supplier?.favicon_url),
          social: parseRedes(supplier?.social),
        }}
      />
    </div>
  );
}
