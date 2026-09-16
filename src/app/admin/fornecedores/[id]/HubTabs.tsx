"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Abas internas do hub do fornecedor. As abas de F1a são links; as de F1b ainda
// não existem e aparecem como "em breve" (desabilitadas), para a estrutura ficar
// visível desde já. A ativa é destacada pelo pathname.
type Aba = { slug: string; label: string; pronta: boolean };

const ABAS: Aba[] = [
  { slug: "", label: "Visão geral", pronta: true },
  { slug: "produtos", label: "Produtos", pronta: true },
  { slug: "materiais", label: "Material", pronta: true },
  { slug: "disponibilidade", label: "Disponibilidade", pronta: true },
  { slug: "escolas", label: "Escolas / Campus", pronta: false },
  { slug: "conteudo", label: "Conteúdo", pronta: false },
  { slug: "precos", label: "Preço & tabelas", pronta: false },
  { slug: "taxas", label: "Taxas", pronta: false },
  { slug: "promocoes", label: "Promoções", pronta: false },
];

export default function HubTabs({ supplierId }: { supplierId: string }) {
  const pathname = usePathname() || "";
  const base = `/admin/fornecedores/${supplierId}`;

  return (
    <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-neutral-200 pb-3">
      {ABAS.map((aba) => {
        const href = aba.slug ? `${base}/${aba.slug}` : base;
        const ativo = aba.slug ? pathname.startsWith(href) : pathname === base;
        if (!aba.pronta) {
          return (
            <span
              key={aba.label}
              title="Em breve (F1b)"
              className="cursor-not-allowed rounded-full px-3 py-1.5 text-xs font-medium text-neutral-300"
            >
              {aba.label}
            </span>
          );
        }
        return (
          <Link
            key={aba.label}
            href={href}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              ativo ? "bg-brand text-brand-cream" : "text-brand hover:bg-neutral-100"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
