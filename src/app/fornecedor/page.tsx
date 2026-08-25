import { createClient } from "@supabase/supabase-js";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import LogoutButton from "./LogoutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Home do Portal do Fornecedor (Fase A — fundacao). Por enquanto so confirma o
// login e mostra quem entrou e por qual instituicao. Os modulos (painel de
// pendencias, estudantes, materiais, disponibilidade, catalogo, financeiro)
// entram por cima desta base, todos atras de exigirFornecedor().
export default async function FornecedorHomePage() {
  const sessao = await exigirFornecedor("/fornecedor");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: supplier } = await supabase
    .from("supplier")
    .select("display_name")
    .eq("id", sessao.supplierId)
    .maybeSingle();

  const papelLabel: Record<string, string> = {
    supplier_admin: "Administrador",
    admissions: "Admissões",
    finance: "Financeiro",
    marketing: "Marketing",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5ead9" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          background: "#042f1b",
          color: "#f5ead9",
        }}
      >
        <span style={{ fontFamily: "Bellefair, serif", fontSize: 20 }}>EXP Tour · Portal do Parceiro</span>
        <LogoutButton />
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 28, margin: "0 0 8px" }}>
          {supplier?.display_name || "Sua instituição"}
        </h1>
        <p style={{ color: "#042f1b", opacity: 0.8, fontSize: 15, margin: "0 0 24px" }}>
          Você está conectado como <strong>{sessao.email}</strong> ({papelLabel[sessao.role] || sessao.role}).
        </p>

        <div
          style={{
            border: "1px solid #d8ccb4",
            borderRadius: 12,
            background: "#fff",
            padding: 20,
            color: "#042f1b",
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            O portal está em construção. Em breve, aqui: pendências, estudantes, materiais,
            disponibilidade, catálogo de preços e financeiro.
          </p>
        </div>
      </main>
    </div>
  );
}
