import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import {
  obterProdutoAdmin,
  listarCampusDoTenant,
  listarProdutosAdmin,
  listarVinculosDoProduto,
} from "@/lib/produto-admin-service";
import { obterElegibilidadeAdmin } from "@/lib/elegibilidade-admin-service";
import { obterConteudoProdutoAdmin } from "@/lib/produto-conteudo-admin-service";
import ProdutoEditor from "@/components/ProdutoEditor";
import ElegibilidadeEditor from "@/components/ElegibilidadeEditor";
import ConteudoEditor from "@/components/ConteudoEditor";
import SecaoPrecosTaxas from "@/components/SecaoPrecosTaxas";
import ProdutoTabs from "@/components/ProdutoTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Complementar", package: "Pacote",
};

// Página unificada "Editar produto" (estilo Edvisor "Edit Program"): reúne todas
// as dimensões do produto numa só tela, organizadas em abas — Informação
// (core + detalhe do vertical + itens de pacote), Preços & Taxas (tabelas e taxas
// vinculadas), Elegibilidade e Conteúdo. Cada aba usa os MESMOS editores/serviços
// de sempre; a escrita continua indo para as rotas dedicadas. O kind é imutável.
export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/produtos/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produto = await obterProdutoAdmin(supabase, tenantId, id);
  if (!produto) notFound();

  const [campi, produtos, regrasElig, conteudo, vinculos] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    obterElegibilidadeAdmin(supabase, tenantId, id),
    obterConteudoProdutoAdmin(supabase, tenantId, id),
    listarVinculosDoProduto(supabase, tenantId, id),
  ]);

  const kind = String(produto.core.kind ?? "");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/produtos" className="text-sm text-brand-golddark hover:underline">← Produtos</Link>
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
                inicial={{ id, core: produto.core, detalhe: produto.detalhe, itens: produto.itens }}
              />
            ),
          },
          {
            chave: "precos",
            label: "Preços & Taxas",
            conteudo: <SecaoPrecosTaxas precos={vinculos.precos} taxas={vinculos.taxas} />,
          },
          {
            chave: "elegibilidade",
            label: "Elegibilidade",
            conteudo: <ElegibilidadeEditor productId={id} inicial={regrasElig ?? []} />,
          },
          {
            chave: "conteudo",
            label: "Conteúdo",
            conteudo: (
              <ConteudoEditor productId={id} inicialContent={conteudo?.content ?? []} inicialMedia={conteudo?.media ?? []} />
            ),
          },
        ]}
      />
    </div>
  );
}
