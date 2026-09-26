import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarSubmissionsDoFornecedor } from "@/lib/price-submission-service";
import { t } from "@/lib/fornecedor-i18n";
import UploadPriceList from "./UploadPriceList";
import NovaTabelaPreco from "./NovaTabelaPreco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL_COR: Record<string, string> = {
  draft: "var(--p-accent-ink)",
  pending_admin: "#1d4ed8",
  approved: "var(--p-success-ink)",
  rejected: "#b91c1c",
};

// Preços (Fase C): a escola sobe o price list (PDF), a IA extrai um rascunho, a
// escola revisa e aprova; a EXP Tour publica. Escopado ao supplier da sessao.
export default async function PrecosPage() {
  const sessao = await exigirFornecedor("/fornecedor/precos");
  const supabase = getServiceClient();
  const submissions = await listarSubmissionsDoFornecedor(supabase, sessao.supplierId);

  const T = t(sessao.language, {
    pt: {
      titulo: "Preços",
      intro: "Envie o seu price list em PDF. Extraímos um rascunho para você revisar; depois de aprovar, a EXP Tour publica no catálogo.",
      tabelasTitulo: "Tabelas por carga horária",
      tabelasTexto: "Confira os preços publicados hoje agrupados por aulas por semana e formato de aula, e quais cursos estão em cada tabela.",
      verTabelas: "Ver tabelas →",
      promocoesTitulo: "Promoções",
      promocoesTexto: "Proponha descontos, semanas grátis ou isenção de taxa para seus cursos e acomodações. A EXP Tour revisa e publica.",
      verPromocoes: "Ver promoções →",
      seusEnvios: "Seus envios",
      nenhumEnvio: "Nenhum price list enviado ainda.",
      arquivo: "Arquivo",
      itens: "Itens",
      status: "Status",
      revisar: "Revisar →",
      ver: "Ver →",
      statusLabel: {
        draft: "Rascunho",
        pending_admin: "Aguardando EXP Tour",
        approved: "Publicado",
        rejected: "Recusado",
      } as Record<string, string>,
    },
    en: {
      titulo: "Pricing",
      intro: "Send your price list as a PDF. We extract a draft for you to review; once approved, EXP Tour publishes it to the catalog.",
      tabelasTitulo: "Tables by weekly hours",
      tabelasTexto: "Check today's published prices grouped by lessons per week and lesson format, and which courses are in each table.",
      verTabelas: "View tables →",
      promocoesTitulo: "Promotions",
      promocoesTexto: "Propose discounts, free weeks or fee waivers for your courses and accommodation. EXP Tour reviews and publishes them.",
      verPromocoes: "View promotions →",
      seusEnvios: "Your submissions",
      nenhumEnvio: "No price list submitted yet.",
      arquivo: "File",
      itens: "Items",
      status: "Status",
      revisar: "Review →",
      ver: "View →",
      statusLabel: {
        draft: "Draft",
        pending_admin: "Awaiting EXP Tour",
        approved: "Published",
        rejected: "Rejected",
      } as Record<string, string>,
    },
  });

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.intro}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
        <div style={{ flex: "1 1 320px" }}>
          <UploadPriceList language={sessao.language} />
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <NovaTabelaPreco language={sessao.language} />
        </div>
      </div>

      {/* Leitura do que ja esta publicado, agrupado por carga horaria (a tabela
          como objeto, os cursos como etiquetas) — o jeito como a escola de fato
          precifica. */}
      <div
        style={{
          border: "1px solid var(--p-line)",
          borderRadius: 12,
          background: "#fff",
          padding: "14px 16px",
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <strong style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16 }}>
            {T.tabelasTitulo}
          </strong>
          <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 13, margin: "4px 0 0", maxWidth: "58ch" }}>
            {T.tabelasTexto}
          </p>
        </div>
        <Link
          href="/fornecedor/precos/tabelas"
          style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {T.verTabelas}
        </Link>
      </div>

      {/* Promoções são conceitualmente parte de precificação (desconto/isenção
          sobre o preço) — sub-seção desta aba, não um item novo no menu. */}
      <div
        style={{
          border: "1px solid var(--p-line)",
          borderRadius: 12,
          background: "#fff",
          padding: "14px 16px",
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <strong style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16 }}>
            {T.promocoesTitulo}
          </strong>
          <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 13, margin: "4px 0 0", maxWidth: "58ch" }}>
            {T.promocoesTexto}
          </p>
        </div>
        <Link
          href="/fornecedor/precos/promocoes"
          style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {T.verPromocoes}
        </Link>
      </div>

      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "24px 0 12px" }}>
        {T.seusEnvios}
      </h2>
      {submissions.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumEnvio}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.arquivo}</th>
                <th style={{ padding: "10px 14px" }}>{T.itens}</th>
                <th style={{ padding: "10px 14px" }}>{T.status}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const cor = STATUS_LABEL_COR[s.status] || "var(--p-muted)";
                const texto = T.statusLabel[s.status] || s.status;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>{s.sourceFilename || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {s.itens} {s.currency ? `· ${s.currency}` : ""}
                    </td>
                    <td style={{ padding: "10px 14px", color: cor, fontWeight: 600 }}>{texto}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/precos/${s.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
                        {s.status === "draft" ? T.revisar : T.ver}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
