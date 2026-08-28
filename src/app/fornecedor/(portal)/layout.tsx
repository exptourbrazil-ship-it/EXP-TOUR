import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import LogoutButton from "../LogoutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Layout das telas AUTENTICADAS do Portal do Fornecedor (grupo (portal)). NAO
// envolve /fornecedor/login (que fica fora do grupo). Guarda a sessao e desenha
// o cabecalho/navegacao comuns. Cada pagina reconfere a sessao para os dados.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirFornecedor("/fornecedor");

  const supabase = getServiceClient();
  const { data: supplier } = await supabase
    .from("supplier")
    .select("display_name")
    .eq("id", sessao.supplierId)
    .maybeSingle();

  return (
    <div style={{ minHeight: "100vh", background: "#f5ead9" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          background: "#042f1b",
          color: "#f5ead9",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Bellefair, serif", fontSize: 20 }}>EXP Tour · Portal do Parceiro</span>
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <Link href="/fornecedor" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Painel
            </Link>
            <Link href="/fornecedor/estudantes" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Estudantes
            </Link>
            <Link href="/fornecedor/disponibilidade" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Disponibilidade
            </Link>
            <Link href="/fornecedor/precos" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Preços
            </Link>
            <Link href="/fornecedor/materiais" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Materiais
            </Link>
            <Link href="/fornecedor/financeiro" style={{ color: "#c9a35e", textDecoration: "none" }}>
              Financeiro
            </Link>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{supplier?.display_name || sessao.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 24px" }}>{children}</main>
    </div>
  );
}
