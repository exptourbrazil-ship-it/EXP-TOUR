"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ItemNav = {
  href: string;
  label: string;
  disponivel: boolean;
};

// Navegacao inferior compartilhada entre as areas da Area do Cliente.
// Embarque, Viagem e Retorno ainda nao tem pagina propria (fase seguinte
// do trabalho de UX), por isso aparecem desabilitadas por enquanto.
const ITENS: ItemNav[] = [
{ href: "/inicio", label: "Início", disponivel: true },
  { href: "/parcelas", label: "Financeiro", disponivel: true },
  { href: "/parcelas", label: "Docs", disponivel: true },
  { href: "/embarque", label: "Embarque", disponivel: false },
  { href: "/viagem", label: "Viagem", disponivel: false },
  { href: "/retorno", label: "Retorno", disponivel: false },
  ];

export default function BottomNav() {
    const pathname = usePathname();

  return (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
    {ITENS.map((item, index) => {
              const ativo = item.disponivel && pathname === item.href;

          if (!item.disponivel) {
            return (
                            <div
                              key={item.label + index}
                              className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-neutral-300"
                            >
                              <span className="h-5 w-5 rounded-full border border-neutral-200" />
                              <span>{item.label}</span>
                            </div>
                          );
          }

          return (
                        <Link
                          key={item.label + index}
                          href={item.href}
                          className={
                            "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] " +
                            (ativo ? "text-brand font-medium" : "text-neutral-400")
            }
                        >
                          <span
                            className={
                              "h-5 w-5 rounded-full " +
                              (ativo ? "bg-brand" : "border border-neutral-300")
            }
                          />
                          <span>{item.label}</span>
                        </Link>
                      );
})}
      </div>
            </nav>
          );
}
