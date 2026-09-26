import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import {
  getServiceClient,
  obterEstudanteDoFornecedor,
  listarDocumentosDoFornecedor,
  pendenciasDoContratoFornecedor,
} from "@/lib/fornecedor-dados";
import { labelDoTipoDocumento } from "@/lib/documentos";
import { t } from "@/lib/fornecedor-i18n";
import UploadDocumento from "./UploadDocumento";
import PendenciasLista from "../../PendenciasLista";

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

  const [documentos, pendencias] = await Promise.all([
    listarDocumentosDoFornecedor(supabase, sessao.supplierId, id),
    pendenciasDoContratoFornecedor(supabase, sessao.supplierId, id),
  ]);

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar para Estudantes",
      cancelado: "Cancelado",
      semNome: "(sem nome)",
      pendencias: "Pendências",
      documentosCompartilhados: "Documentos compartilhados",
      documentosDescricao: "Documentos que a EXP Tour compartilhou com a sua instituição para este estudante.",
      nenhumDocumento: "Nenhum documento compartilhado ainda.",
      baixar: "Baixar →",
      campoEstudante: "Estudante",
      campoSexo: "Sexo",
      feminino: "Feminino",
      masculino: "Masculino",
      campoResponsavel: "Responsável",
      campoEmailResponsavel: "E-mail do responsável",
      campoPrograma: "Programa",
      campoDestino: "Destino",
      campoVisto: "Visto",
      campoEnderecoEscola: "Endereço da escola",
      campoAcomodacao: "Acomodação",
      campoContatoLocal: "Contato local",
      campoTelefoneLocal: "Telefone local",
    },
    en: {
      voltar: "← Back to Students",
      cancelado: "Cancelled",
      semNome: "(no name)",
      pendencias: "Pending items",
      documentosCompartilhados: "Shared documents",
      documentosDescricao: "Documents EXP Tour has shared with your institution for this student.",
      nenhumDocumento: "No shared documents yet.",
      baixar: "Download →",
      campoEstudante: "Student",
      campoSexo: "Gender",
      feminino: "Female",
      masculino: "Male",
      campoResponsavel: "Guardian",
      campoEmailResponsavel: "Guardian's email",
      campoPrograma: "Program",
      campoDestino: "Destination",
      campoVisto: "Visa",
      campoEnderecoEscola: "School address",
      campoAcomodacao: "Accommodation",
      campoContatoLocal: "Local contact",
      campoTelefoneLocal: "Local phone",
    },
  });

  const linhas: Array<[string, string | null]> = [
    [T.campoEstudante, e.estudanteNome],
    [T.campoSexo, e.estudanteSexo === "F" ? T.feminino : e.estudanteSexo === "M" ? T.masculino : null],
    [T.campoResponsavel, e.titularNome],
    [T.campoEmailResponsavel, e.titularEmail],
    [T.campoPrograma, e.programa],
    [T.campoDestino, titulo(e.paisDestino)],
    [T.campoVisto, titulo(e.vistoStatus)],
    [T.campoEnderecoEscola, e.escolaEndereco],
    [T.campoAcomodacao, e.acomodacaoEndereco],
    [T.campoContatoLocal, e.contatoLocalNome],
    [T.campoTelefoneLocal, e.contatoLocalTelefone],
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/estudantes" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          {T.voltar}
        </Link>
      </div>

      <div style={{ border: "1px solid var(--p-line)", borderRadius: 14, background: "#fff", padding: 22 }}>
        <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>
          {e.estudanteNome || T.semNome}
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
            {T.cancelado}
          </span>
        ) : null}

        <dl style={{ margin: 0 }}>
          {linhas.map(([rotulo, valor]) => (
            <div
              key={rotulo}
              style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid var(--p-line)", fontSize: 14 }}
            >
              <dt style={{ width: 200, color: "var(--p-muted)", flexShrink: 0 }}>{rotulo}</dt>
              <dd style={{ margin: 0, color: "var(--p-ink)" }}>{valor || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {pendencias.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 10px" }}>
            {T.pendencias}
          </h2>
          <PendenciasLista pendencias={pendencias} language={sessao.language} />
        </div>
      ) : null}

      <div style={{ marginTop: 18, border: "1px solid var(--p-line)", borderRadius: 14, background: "#fff", padding: 22 }}>
        <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 4px" }}>
          {T.documentosCompartilhados}
        </h2>
        <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 14px" }}>
          {T.documentosDescricao}
        </p>

        {documentos.length === 0 ? (
          <p style={{ color: "var(--p-muted)", fontSize: 14, margin: 0 }}>
            {T.nenhumDocumento}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {documentos.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: "1px solid var(--p-line)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--p-ink)", fontSize: 14, fontWeight: 600 }}>
                    {labelDoTipoDocumento(d.tipoDocumento)}
                  </div>
                  <div
                    style={{
                      color: "var(--p-muted)",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.nomeArquivo || "—"}
                  </div>
                </div>
                <a
                  href={`/api/fornecedor/documentos/${d.id}/download`}
                  style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13, flexShrink: 0 }}
                >
                  {T.baixar}
                </a>
              </li>
            ))}
          </ul>
        )}

        <UploadDocumento contratoId={e.contratoId} language={sessao.language} />
      </div>
    </div>
  );
}
