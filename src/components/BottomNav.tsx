"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ItemNav = {
  href: string;
  label: string;
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
// Etapa "Embarque": aviao decolando (mais intuitivo que a bussola anterior).
const iconeEmbarque = (
  <Ico>
    <path d="M3 15l18-5-3.5 6M3 15l4 3 3-1M3 15l7-2" />
    <path d="M13.5 11 11 6l1.8-.3 3.2 4" />
  </Ico>
);
const iconeViagem = (
  <Ico>
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Ico>
);
// Etapa "Retorno": casa com seta de volta.
const iconeRetorno = (
  <Ico>
    <path d="M9 21V13h6v8" />
    <path d="M4 11.5 12 4l8 7.5" />
  </Ico>
);

// Navegacao inferior compartilhada entre as areas da Area do Cliente.
const ITENS: ItemNav[] = [
  { href: "/inicio", label: "Início", icon: iconeInicio },
  { href: "/parcelas", label: "Financeiro", icon: iconeFinanceiro },
  { href: "/documentos", label: "Documentos", icon: iconeDocs },
  { href: "/embarque", label: "Embarque", icon: iconeEmbarque },
  { href: "/viagem", label: "Viagem", icon: iconeViagem },
  { href: "/retorno", label: "Retorno", icon: iconeRetorno },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-between px-1">
        {ITENS.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={
                "group relative flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10.5px] transition-colors " +
                (ativo ? "text-brand font-semibold" : "text-neutral-500 hover:text-brand")
              }
            >
              {/* Indicador da aba ativa */}
              <span
                className={
                  "absolute top-0 h-0.5 w-8 rounded-full transition-all " +
                  (ativo ? "bg-brand-gold opacity-100" : "opacity-0")
                }
              />
              <span className="transition-transform group-active:scale-90">{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
      {/* Espaco seguro para aparelhos com barra de gestos */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
