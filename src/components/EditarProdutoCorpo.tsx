import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import {
  obterProdutoAdmin,
  listarCampusDoTenant,
  listarProdutosAdmin,
  listarVinculosDoProduto,
  listarDisponibilidadeDoProduto,
  listarPromocoesDoProduto,
} from "@/lib/produto-admin-service";
import { obterElegibilidadeAdmin } from "@/lib/elegibilidade-admin-service";
import { obterConteudoProdutoAdmin } from "@/lib/produto-conteudo-admin-service";
import ProdutoEditor from "@/components/ProdutoEditor";
import ElegibilidadeEditor from "@/components/ElegibilidadeEditor";
import ConteudoEditor from "@/components/ConteudoEditor";
import SecaoPrecosTaxas from "@/components/SecaoPrecosTaxas";
import SecaoSazonal from "@/components/SecaoSazonal";
import { listarAjustesSazonais } from "@/lib/sazonal-admin-service";
import SecaoDisponibilidade from "@/components/SecaoDisponibilidade";
import SecaoPromocoes from "@/components/SecaoPromocoes";
import ProdutoTabs from "@/components/ProdutoTabs";

const KIND_LABEL: Record<string, string> = {
  program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Complementar", package: "Pacote",
};

// Corpo COMPARTILHADO do editor de produto (Informação · Preços & Taxas · Datas &
// Disponibilidade · Promoções · Elegibilidade · Conteúdo). Usado tanto pela tela
// global (/admin/produtos/[id]) quanto DENTRO do hub do fornecedor
// (/admin/fornecedores/[id]/produto/[productId]) — a edição acontece no mesmo
// lugar, só muda a moldura e o link de "voltar".
//
// POSSE: sempre por tenant. Quando `supplierIdEsperado` é passado (fluxo do hub),
// confere que o produto pertence AQUELE fornecedor (via campus) — notFound caso
// contrário, para a URL do hub não abrir produto de outro fornecedor/tenant.
export default async function EditarProdutoCorpo({
  productId,
  voltarHref,
  voltarLabel,
  supplierIdEsperado,
}: {
  productId: string;
  voltarHref: string;
  voltarLabel: string;
  supplierIdEsperado?: string;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produto = await obterProdutoAdmin(supabase, tenantId, productId);
  if (!produto) notFound();

  const kind = String(produto.core.kind ?? "");

  const [campi, produtos, regrasElig, conteudo, vinculos, intakes, promocoes] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    obterElegibilidadeAdmin(supabase, tenantId, productId),
    obterConteudoProdutoAdmin(supabase, tenantId, productId),
    listarVinculosDoProduto(supabase, tenantId, productId),
    listarDisponibilidadeDoProduto(supabase, tenantId, productId, kind),
    listarPromocoesDoProduto(supabase, tenantId, productId),
  ]);

  // Alta/baixa temporada: so faz sentido em ACOMODACAO (e onde as escolas
  // publicam suplemento por semana).
  const ajustesSazonais: Awaited<ReturnType<typeof listarAjustesSazonais>> = [];

  // Fornecedor do produto (via campus) — para o link do editor de disponibilidade
  // e para a checagem de posse do hub.
  const campusId = String(produto.core.campus_id ?? "");
  const supplierId = campi.find((c) => c.id === campusId)?.supplierId ?? null;

  // Moeda base do campus: sugestao no formulario de temporada (a escola publica
  // o suplemento na moeda dela). Consulta direta — listarCampusDoTenant nao traz.
  let moedaDoCampus = "EUR";
  if (kind === "accommodation" && campusId) {
    const { data: campusMoeda } = await supabase
      .from("campus")
      .select("base_currency")
      .eq("tenant_id", tenantId)
      .eq("id", campusId)
      .maybeSingle();
    if (campusMoeda?.base_currency) moedaDoCampus = campusMoeda.base_currency as string;
  }

  // Posse do hub: o produto tem que ser do fornecedor esperado. Conferida ANTES de
  // qualquer leitura extra (moeda / ajuste sazonal).
  if (supplierIdEsperado && supplierId !== supplierIdEsperado) notFound();

  if (kind === "accommodation") {
    ajustesSazonais.push(...(await listarAjustesSazonais(supabase, tenantId, productId, campusId || undefined)));
  }

  return (
    <div>
      <Link href={voltarHref} className="text-sm text-brand-golddark hover:underline">← {voltarLabel}</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-2xl text-brand">{String(produto.core.name ?? "")}</h1>
        <span className="rounded-full bg-brand-cream px-2.5 py-0.5 text-xs font-medium text-brand">
          {KIND_LABEL[kind] ?? kind}
        </span>
      </div>

      <ProdutoTabs
        abas={[
          {
            chave: "informacao",
            label: "Informação",
            conteudo: (
              <ProdutoEditor
                campi={campi}
                produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
                inicial={{ id: productId, core: produto.core, detalhe: produto.detalhe, itens: produto.itens }}
                supplierEsperado={supplierIdEsperado}
              />
            ),
          },
          {
            chave: "precos",
            label: "Preços & Taxas",
            conteudo: (
              <div className="space-y-8">
                <SecaoPrecosTaxas
                  precos={vinculos.precos}
                  taxas={vinculos.taxas}
                  productId={productId}
                  campusId={campusId || null}
                />
                {kind === "accommodation" ? (
                  <SecaoSazonal
                    productId={productId}
                    supplierId={supplierIdEsperado}
                    moedaPadrao={moedaDoCampus}
                    ajustes={ajustesSazonais}
                  />
                ) : null}
              </div>
            ),
          },
          {
            chave: "disponibilidade",
            label: "Datas & Disponibilidade",
            conteudo: <SecaoDisponibilidade kind={kind} supplierId={supplierId} intakes={intakes} />,
          },
          {
            chave: "promocoes",
            label: "Promoções",
            conteudo: <SecaoPromocoes promocoes={promocoes} productId={productId} />,
          },
          {
            chave: "elegibilidade",
            label: "Elegibilidade",
            conteudo: <ElegibilidadeEditor productId={productId} inicial={regrasElig ?? []} />,
          },
          {
            chave: "conteudo",
            label: "Conteúdo",
            conteudo: (
              <ConteudoEditor productId={productId} inicialContent={conteudo?.content ?? []} inicialMedia={conteudo?.media ?? []} />
            ),
          },
        ]}
      />
    </div>
  );
}
