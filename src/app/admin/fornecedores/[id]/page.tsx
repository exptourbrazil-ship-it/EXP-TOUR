import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { resumoInventarioFornecedor } from "@/lib/fornecedor-hub-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Visão geral do fornecedor: contadores do que ele tem hoje + atalhos para as
// abas. Escopado por tenant + supplier no serviço.
export default async function FornecedorVisaoGeralPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const resumo = await resumoInventarioFornecedor(supabase, tenantId, id);
  const base = `/admin/fornecedores/${id}`;

  // href null = aba ainda não pronta (F1b): card informativo, sem link enganoso.
  const cards: { titulo: string; valor: number; legenda: string; href: string | null }[] = [
    { titulo: "Escolas / Campus", valor: resumo.campus, legenda: "unidades do fornecedor", href: `${base}/disponibilidade` },
    { titulo: "Produtos", valor: resumo.produtos, legenda: "programas, acomodações…", href: `${base}/produtos` },
    { titulo: "Materiais", valor: resumo.materiais, legenda: "brochuras, fotos, mídia", href: `${base}/materiais` },
    { titulo: "Promoções", valor: resumo.promocoes, legenda: "vigentes e agendadas", href: null },
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-neutral-600">
        Tudo deste fornecedor em um só lugar. Use as abas acima para gerir catálogo, conteúdo, preços,
        taxas, promoções, material e disponibilidade — sempre no escopo deste fornecedor.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const conteudo = (
            <>
              <p className="text-xs font-medium text-neutral-500">{c.titulo}</p>
              <p className="mt-2 font-serif text-2xl text-brand">{c.valor}</p>
              <p className="mt-1 text-xs text-neutral-400">{c.legenda}</p>
            </>
          );
          return c.href ? (
            <Link
              key={c.titulo}
              href={c.href}
              className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
            >
              {conteudo}
            </Link>
          ) : (
            <div key={c.titulo} className="rounded-2xl border border-neutral-200 bg-white p-4">
              {conteudo}
            </div>
          );
        })}
      </div>
    </div>
  );
}
