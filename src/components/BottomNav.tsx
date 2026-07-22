"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ItemNav = {
  href: string;
  label: string;
  disponivel: boolean;
  icon: React.ReactNode;
};

// Icones no estilo do mockup (contorno fino), desenhados inline como SVG
// para nao depender de biblioteca externa.
function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      {children}
    </svg>
  );
}

const iconeInicio = (
  <Ico>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9h12v-9" />
  </Ico>
);
const iconeFinanceiro = (
  <Ico>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </Ico>
);
const iconeDocs = (
  <Ico>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
  </Ico>
);
const iconeEmbarque = (
  <Ico>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-2 5-4 2 2-5z" />
  </Ico>
);
const iconeViagem = (
  <Ico>
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Ico>
);
const iconeRetorno = (
  <Ico>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Ico>
);

// Navegacao inferior compartilhada entre as areas da Area do Cliente.
// Embarque, Viagem e Retorno ainda nao tem pagina propria (fase seguinte),
// por isso aparecem desabilitadas por enquanto.
const ITENS: ItemNav[] = [
  { href: "/inicio", label: "In\u00edcio", disponivel: true, icon: iconeInicio },
  { href: "/parcelas", label: "Financeiro", disponivel: true, icon: iconeFinanceiro },
  { href: "/documentos", label: "Docs", disponivel: true, icon: iconeDocs },
  { href: "/embarque", label: "Embarque", disponivel: false, icon: iconeEmbarque },
  { href: "/viagem", label: "Viagem", disponivel: false, icon: iconeViagem },
  { href: "/retorno", label: "Retorno", disponivel: false, icon: iconeRetorno },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-stretch justify-between px-2">
        {ITENS.map((item, index) => {
          const ativo = item.disponivel && pathname === item.href;

          if (!item.disponivel) {
            return (
              <div
                key={item.label + index}
                className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-neutral-300"
              >
                {item.icon}
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
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
