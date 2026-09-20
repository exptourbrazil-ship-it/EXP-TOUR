import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { resumoInventarioFornecedor, contarProdutosPorTipoDoFornecedor } from "@/lib/fornecedor-hub-service";
import { parseRedes, urlFavicon } from "@/lib/redes-sociais";
import MarcaEditor from "./MarcaEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inventário (Home do fornecedor, estilo Edvisor): contadores por tipo de produto
// + campi + material, com atalhos. Escopado por tenant + supplier no serviço.
export default async function FornecedorInventarioPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [resumo, porTipo, marca] = await Promise.all([
    resumoInventarioFornecedor(supabase, tenantId, id),
    contarProdutosPorTipoDoFornecedor(supabase, tenantId, id),
    supabase
      .from("supplier")
      .select("favicon_url, social")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle(),
  ]);
  const base = `/admin/fornecedores/${id}`;

  const inventario: { titulo: string; valor: number; href: string }[] = [
    { titulo: "Programas", valor: porTipo.program, href: `${base}/programas` },
    { titulo: "Acomodação", valor: porTipo.accommodation, href: `${base}/acomodacao` },
    { titulo: "Seguro", valor: porTipo.insurance, href: `${base}/seguro` },
    { titulo: "Outros", valor: porTipo.other, href: `${base}/outros` },
    { titulo: "Pacotes", valor: porTipo.package, href: `${base}/pacotes` },
  ];
  const secundarios: { titulo: string; valor: number; href: string }[] = [
    { titulo: "Escolas / Campus", valor: resumo.campus, href: `${base}/escolas` },
    { titulo: "Materiais", valor: resumo.materiais, href: `${base}/materiais` },
    { titulo: "Promoções", valor: resumo.promocoes, href: `${base}/promocoes` },
  ];

  return (
    <div>
      <h2 className="mb-1 font-serif text-lg text-brand">Inventário</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Tudo deste fornecedor em um só lugar. Preço, conteúdo e disponibilidade ficam dentro de cada
        produto — abra um item para editar.
      </p>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Produtos por tipo</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {inventario.map((c) => (
          <Link
            key={c.titulo}
            href={c.href}
            className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-serif text-2xl text-brand">{c.valor}</p>
            <p className="mt-1 text-xs text-neutral-500">{c.titulo}</p>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {secundarios.map((c) => (
          <Link
            key={c.titulo}
            href={c.href}
            className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
          >
            <p className="font-serif text-xl text-brand">{c.valor}</p>
            <p className="mt-1 text-xs text-neutral-500">{c.titulo}</p>
          </Link>
        ))}
      </div>

      <MarcaEditor
        supplierId={id}
        inicial={{
          faviconUrl: urlFavicon(marca.data?.favicon_url),
          social: parseRedes(marca.data?.social),
        }}
      />

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400">Atalhos</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/produto/novo`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo produto
        </Link>
        <Link href={`${base}/disponibilidade`} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-brand hover:bg-neutral-50">
          Disponibilidade
        </Link>
        <Link href={`${base}/materiais`} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-brand hover:bg-neutral-50">
          Material
        </Link>
      </div>
    </div>
  );
}
