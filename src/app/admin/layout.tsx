import { cookies } from "next/headers";
import Link from "next/link";
import Logo from "@/components/Logo";
import AdminNav from "@/components/AdminNav";
import { verificarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Layout comum do painel admin: barra superior no verde da marca + menu de
// navegacao (lateral no desktop, faixa no topo no mobile). So desenha o
// "shell" quando ha sessao de admin valida; caso contrario (ex.: tela de
// login), renderiza o conteudo puro. As paginas protegidas continuam
// chamando exigirAdmin por conta propria — aqui a verificacao apenas decide
// se mostra a moldura de navegacao.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);

  // Sem sessao valida (ex.: /admin/login) — sem moldura.
  if (!sessao) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-brand-cream/30">
      <header className="bg-brand">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/admin" aria-label="Início do painel">
            <Logo escuro />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-brand-cream/80 sm:inline">Painel administrativo</span>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream text-sm font-medium text-brand ring-1 ring-white/20"
              title={sessao.usuario}
              aria-label={"Sessão de " + sessao.usuario}
            >
              {sessao.usuario.trim().charAt(0).toUpperCase() || "A"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col lg:min-h-[calc(100vh-73px)] lg:flex-row">
        <aside className="border-b border-neutral-200 bg-white lg:border-b-0">
          <AdminNav />
        </aside>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
