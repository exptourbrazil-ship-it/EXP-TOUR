import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient, obterEstudanteDoFornecedor } from "@/lib/fornecedor-dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function titulo(s: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Detalhe (reduzido, somente leitura) de um estudante do fornecedor. A posse e
// reconferida em obterEstudanteDoFornecedor: se o contrato nao for desta escola,
// devolve null -> notFound (nada de outra escola vaza, nem por id forcado).
export default async function EstudanteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirFornecedor(`/fornecedor/estudantes/${id}`);
  const supabase = getServiceClient();
  const e = await obterEstudanteDoFornecedor(supabase, sessao.supplierId, id);
  if (!e) notFound();

  const linhas: Array<[string, string | null]> = [
    ["Estudante", e.estudanteNome],
    ["Sexo", e.estudanteSexo === "F" ? "Feminino" : e.estudanteSexo === "M" ? "Masculino" : null],
    ["Responsável", e.titularNome],
    ["E-mail do responsável", e.titularEmail],
    ["Programa", e.programa],
    ["Destino", titulo(e.paisDestino)],
    ["Visto", titulo(e.vistoStatus)],
    ["Endereço da escola", e.escolaEndereco],
    ["Acomodação", e.acomodacaoEndereco],
    ["Contato local", e.contatoLocalNome],
    ["Telefone local", e.contatoLocalTelefone],
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/estudantes" style={{ color: "#8a6d2f", fontSize: 13, textDecoration: "none" }}>
          ← Voltar para Estudantes
        </Link>
      </div>

      <div style={{ border: "1px solid #d8ccb4", borderRadius: 14, background: "#fff", padding: 22 }}>
        <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 24, margin: "0 0 4px" }}>
          {e.estudanteNome || "(sem nome)"}
        </h1>
        {e.canceladoEm ? (
          <span
            style={{
              display: "inline-block",
              background: "#b91c1c",
              color: "#fff",
              borderRadius: 999,
              padding: "2px 10px",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            Cancelado
          </span>
        ) : null}

        <dl style={{ margin: 0 }}>
          {linhas.map(([rotulo, valor]) => (
            <div
              key={rotulo}
              style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid #f0e9da", fontSize: 14 }}
            >
              <dt style={{ width: 200, color: "#6b7280", flexShrink: 0 }}>{rotulo}</dt>
              <dd style={{ margin: 0, color: "#042f1b" }}>{valor || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
        Documentos compartilhados e linha do tempo entram na próxima fase do portal.
      </p>
    </div>
  );
}
