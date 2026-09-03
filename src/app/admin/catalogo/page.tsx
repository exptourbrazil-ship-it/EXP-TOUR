import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { contarInventario, listarCampusDoTenant } from "@/lib/produto-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hub de Inventário/Catálogo do Admin (estrutura estilo Edvisor). Reúne numa
// página: contagens por tipo de produto (cartões com "Ver"), ações rápidas de
// criação e a lista de campi/fornecedores. Autorização por fornecedores.gerir.

// Cartão de contagem (número grande + rótulo + link "Ver"). Ícone por vertical.
function CartaoContagem({ label, valor, href, icone }: { label: string; valor: number; href: string; icone: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cream text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d={icone} />
            </svg>
          </span>
          {label}
        </span>
        <Link href={href} className="text-sm font-medium text-brand-golddark hover:underline">Ver</Link>
      </div>
      <div className="font-serif text-3xl text-brand">{valor}</div>
    </div>
  );
}

// Cartão de ação rápida (ícone + título → link de criação).
function CartaoAcao({ label, href, icone }: { label: string; href: string; icone: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cream text-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d={icone} />
        </svg>
      </span>
      <span className="text-sm font-medium text-brand">{label}</span>
    </Link>
  );
}

const IC = {
  program: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1 3 2 6 2s6-1 6-2v-5",
  accommodation: "M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2M21 18v2M6 10V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3",
  insurance: "M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z",
  other: "M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8zM7.5 7.5h.01",
  package: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12l8.73-5.04M12 22V12",
  preco: "M9 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9M9 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M9 3v18M12 8h4M12 12h4",
  taxa: "M12 3v18M8 7h6a3 3 0 0 1 0 6H8m0 0h8",
  promo: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  campus: "M3 21V8l6-4 6 4v13M9 21v-5h4v5M13 8h5a1 1 0 0 1 1 1v12",
};

export default async function CatalogoHubPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/catalogo");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [contagem, campi] = await Promise.all([
    contarInventario(supabase, tenantId),
    listarCampusDoTenant(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Catálogo</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Inventário do tenant: programas, acomodações, seguros, complementares e pacotes — com preços, taxas, promoções e disponibilidade.
      </p>

      {/* Contagens por tipo */}
      <h2 className="mb-3 font-serif text-lg text-brand">Seu inventário</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CartaoContagem label="Programas" valor={contagem.program} href="/admin/produtos?kind=program" icone={IC.program} />
        <CartaoContagem label="Acomodações" valor={contagem.accommodation} href="/admin/produtos?kind=accommodation" icone={IC.accommodation} />
        <CartaoContagem label="Seguros" valor={contagem.insurance} href="/admin/produtos?kind=insurance" icone={IC.insurance} />
        <CartaoContagem label="Complementares" valor={contagem.other} href="/admin/produtos?kind=other" icone={IC.other} />
        <CartaoContagem label="Pacotes" valor={contagem.package} href="/admin/produtos?kind=package" icone={IC.package} />
      </div>

      {/* Ações rápidas */}
      <h2 className="mb-3 font-serif text-lg text-brand">Ações rápidas</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoAcao label="Novo produto" href="/admin/produtos/novo" icone={IC.program} />
        <CartaoAcao label="Nova tabela de preço" href="/admin/precos/tabelas/nova" icone={IC.preco} />
        <CartaoAcao label="Nova taxa" href="/admin/precos/taxas/nova" icone={IC.taxa} />
        <CartaoAcao label="Nova promoção" href="/admin/precos/promocoes/nova" icone={IC.promo} />
      </div>

      {/* Campi / fornecedores */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg text-brand">Seus campi</h2>
        <Link href="/admin/fornecedores" className="text-sm font-medium text-brand-golddark hover:underline">Fornecedores →</Link>
      </div>
      {campi.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum campus cadastrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Fornecedor</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {campi.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">{c.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{c.supplierName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
