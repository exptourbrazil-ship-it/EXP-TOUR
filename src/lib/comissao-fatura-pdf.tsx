// PDF da FATURA DE COMISSAO (EXP Tour/Forio -> escola) — SERVER-ONLY.
// @react-pdf/renderer (JS puro). Em ingles: a escola e a destinataria. Cores e
// fonte vem do tema de PDF do tenant (mesmo do PDF da cotacao). NUNCA importar
// em codigo client.
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { getTenantBrand, type PdfTheme } from "@/lib/tenant-brand";
import type { EmissorFatura } from "@/lib/comissao-fatura";

export type DadosFaturaPdf = {
  tenantSlug: string;
  numero: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  emissor: EmissorFatura;
  escola: { nome: string; legalName: string | null; pais: string | null };
  studentName: string | null;
  programName: string | null;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  paidToSchoolAmount: number;
  paidToSchoolAt: string | null;
  commissionBasis: string | null;
  commissionType: string | null;
  commissionValue: number | null;
  commissionAmount: number;
  receivedAmount: number;
  notes: string | null;
};

function fmtMoeda(v: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: moeda }).format(v);
  } catch {
    return `${moeda} ${v.toFixed(2)}`;
  }
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${meses[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

const BASE_ROTULO: Record<string, string> = {
  tuition: "tuition",
  tuition_plus_fees: "tuition + fees",
  total: "total program price",
  none: "",
};

function descricaoTaxa(d: DadosFaturaPdf): string {
  if (d.commissionType === "percent" && d.commissionValue != null) {
    const base = d.commissionBasis ? BASE_ROTULO[d.commissionBasis] : "";
    return `${d.commissionValue}% of ${base || "the amount paid to the school"}`;
  }
  if (d.commissionType === "fixed_per_sale" && d.commissionValue != null) {
    return `Fixed commission per enrolment (${fmtMoeda(d.commissionValue, d.currency)})`;
  }
  if (d.commissionType === "fixed_per_week" && d.commissionValue != null) {
    return `${fmtMoeda(d.commissionValue, d.currency)} per week${d.weeks ? ` × ${d.weeks} weeks` : ""}`;
  }
  return "Commission as per agreement";
}

// Fonte: Helvetica (embutida no react-pdf) para qualquer tenant — fatura e documento
// comercial, nao depende de fonte de marca registrada.
function estilos(t: PdfTheme) {
  return StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: t.ink, fontFamily: "Helvetica", lineHeight: 1.35 },
    faixa: { backgroundColor: t.bar, borderBottomWidth: t.barLine ? 1 : 0, borderBottomColor: t.barLine ?? t.bar, padding: 14, marginBottom: 18, borderRadius: 4 },
    wordmark: { color: t.wordFg, fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 2 },
    tagline: { color: t.sub, fontSize: 8, marginTop: 5 },
    titulo: { fontFamily: "Helvetica-Bold", fontSize: 18, color: t.brand, marginBottom: 8 },
    sub: { color: t.muted, fontSize: 10, marginBottom: 14 },
    linha2: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
    bloco: { width: "48%" },
    rotulo: { color: t.faint, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
    forte: { fontFamily: "Helvetica-Bold", color: t.brand },
    tabela: { borderTopWidth: 1, borderTopColor: t.line, marginTop: 6 },
    tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 6 },
    tdL: { width: "40%", color: t.muted },
    tdR: { width: "60%" },
    totais: { marginTop: 14, alignSelf: "flex-end", width: "55%" },
    totalLinha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalFinal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1.5, borderTopColor: t.brand },
    totalFinalTxt: { fontFamily: "Helvetica-Bold", fontSize: 13, color: t.brand },
    caixa: { marginTop: 18, padding: 10, backgroundColor: t.accentSoft, borderRadius: 4 },
    rodape: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: t.faint, textAlign: "center" },
  });
}

function Linha({ s, rotulo, valor }: { s: ReturnType<typeof estilos>; rotulo: string; valor: string }) {
  return (
    <View style={s.tr}>
      <Text style={s.tdL}>{rotulo}</Text>
      <Text style={s.tdR}>{valor}</Text>
    </View>
  );
}

/** Gera o PDF da fatura de comissao (Buffer). */
export async function gerarFaturaComissaoPdf(d: DadosFaturaPdf): Promise<Buffer> {
  const brand = getTenantBrand(d.tenantSlug);
  const t = brand.pdf;
  const s = estilos(t);
  const saldo = Math.max(0, Math.round((d.commissionAmount - d.receivedAmount) * 100) / 100);

  const doc = (
    <Document title={`Commission invoice ${d.numero}`} author={d.emissor.legalName}>
      <Page size="A4" style={s.page}>
        <View style={s.faixa}>
          <Text style={s.wordmark}>{t.wordmark}</Text>
          {t.tagline ? <Text style={s.tagline}>{t.tagline}</Text> : null}
        </View>

        <Text style={s.titulo}>Commission invoice</Text>
        <Text style={s.sub}>
          No. {d.numero}  ·  Issued {fmtData(d.issueDate)}  ·  Due {fmtData(d.dueDate)}
        </Text>

        <View style={s.linha2}>
          <View style={s.bloco}>
            <Text style={s.rotulo}>From</Text>
            <Text style={s.forte}>{d.emissor.legalName}</Text>
            {d.emissor.address ? <Text>{d.emissor.address}</Text> : null}
            {d.emissor.taxId ? <Text>Tax ID: {d.emissor.taxId}</Text> : null}
            <Text>{d.emissor.email}</Text>
          </View>
          <View style={s.bloco}>
            <Text style={s.rotulo}>Bill to</Text>
            <Text style={s.forte}>{d.escola.legalName || d.escola.nome}</Text>
            {d.escola.legalName && d.escola.legalName !== d.escola.nome ? <Text>{d.escola.nome}</Text> : null}
            {d.escola.pais ? <Text>{d.escola.pais}</Text> : null}
          </View>
        </View>

        <Text style={s.rotulo}>Enrolment</Text>
        <View style={s.tabela}>
          <Linha s={s} rotulo="Student" valor={d.studentName || "—"} />
          <Linha s={s} rotulo="Programme" valor={d.programName || "—"} />
          <Linha s={s} rotulo="Programme dates" valor={`${fmtData(d.startDate)}${d.endDate ? ` – ${fmtData(d.endDate)}` : ""}`} />
          {d.weeks ? <Linha s={s} rotulo="Weeks" valor={String(d.weeks)} /> : null}
          <Linha
            s={s}
            rotulo="Paid by the student to the school"
            valor={`${fmtMoeda(d.paidToSchoolAmount, d.currency)}${d.paidToSchoolAt ? ` on ${fmtData(d.paidToSchoolAt)}` : ""}`}
          />
          <Linha s={s} rotulo="Commission terms" valor={descricaoTaxa(d)} />
        </View>

        <View style={s.totais}>
          <View style={s.totalLinha}>
            <Text>Commission</Text>
            <Text>{fmtMoeda(d.commissionAmount, d.currency)}</Text>
          </View>
          {d.receivedAmount > 0 ? (
            <View style={s.totalLinha}>
              <Text>Received to date</Text>
              <Text>- {fmtMoeda(d.receivedAmount, d.currency)}</Text>
            </View>
          ) : null}
          <View style={s.totalFinal}>
            <Text style={s.totalFinalTxt}>Amount due</Text>
            <Text style={s.totalFinalTxt}>{fmtMoeda(saldo, d.currency)}</Text>
          </View>
        </View>

        <View style={s.caixa}>
          <Text style={s.rotulo}>Payment instructions</Text>
          <Text>{d.emissor.paymentInstructions}</Text>
          <Text style={{ marginTop: 4 }}>Please quote invoice No. {d.numero} on the transfer.</Text>
        </View>

        {d.notes ? (
          <View style={{ marginTop: 12 }}>
            <Text style={s.rotulo}>Notes</Text>
            <Text>{d.notes}</Text>
          </View>
        ) : null}

        <Text style={s.rodape} fixed>
          {d.emissor.legalName} · {d.emissor.email}
        </Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
