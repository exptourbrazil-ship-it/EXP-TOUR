// Geracao do PDF da cotacao (portal do estudante) — SERVER-ONLY.
// Usa @react-pdf/renderer (JS puro, sem headless browser) para produzir um PDF
// de marca a partir da fotografia publica (getPublicQuote). NUNCA importar em
// codigo client. Os valores ja vieram congelados na emissao; aqui so formatamos.
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PublicQuote } from "@/lib/quote-issue-service";
import { getTenantBrand, type PdfTheme } from "@/lib/tenant-brand";

function fmtMoeda(valor: number, moeda: string): string {
  const c = (moeda || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(valor);
    } catch {
      /* fallback abaixo */
    }
  }
  return `${c || "?"} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Estilos derivados do tema de PDF do tenant (cores de impressao). A faixa do
// cabecalho ganha regua inferior so quando t.barLine existe (letterhead claro
// da Forio); a EXP Tour mantem a faixa verde sem regua.
function makeStyles(t: PdfTheme) {
  return StyleSheet.create({
    page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontSize: 10, color: t.ink, fontFamily: "Helvetica" },
    headerBar: {
      backgroundColor: t.bar,
      paddingVertical: 20,
      paddingHorizontal: 40,
      ...(t.barLine ? { borderBottomWidth: 2, borderBottomColor: t.barLine } : {}),
    },
    brandRow: { flexDirection: "row", alignItems: "flex-end" },
    brandWord: { color: t.wordFg, fontSize: 18, letterSpacing: t.dot ? 0 : 4, fontFamily: "Helvetica-Bold" },
    brandDot: { color: t.dot ?? t.wordFg, fontSize: 18, fontFamily: "Helvetica-Bold" },
    brandSub: { color: t.sub, fontSize: 7, letterSpacing: 3, marginTop: 2 },
    body: { paddingHorizontal: 40, paddingTop: 24 },
    h1: { fontSize: 20, color: t.brand, fontFamily: "Helvetica-Bold" },
    intro: { fontSize: 10, color: t.muted, marginTop: 4 },
    card: { borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 14, marginTop: 14 },
    label: { fontSize: 7, color: t.faint, letterSpacing: 1, textTransform: "uppercase" },
    optHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    optTitle: { fontSize: 14, color: t.brand, fontFamily: "Helvetica-Bold" },
    badge: { alignSelf: "flex-start", marginTop: 4, backgroundColor: t.accentSoft, color: t.accentInk, fontSize: 7, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
    totalCol: { alignItems: "flex-end" },
    strike: { fontSize: 8, color: t.faint, textDecoration: "line-through" },
    total: { fontSize: 15, color: t.brand, fontFamily: "Helvetica-Bold" },
    totalConv: { fontSize: 8, color: t.muted, marginTop: 1 },
    sep: { borderTopWidth: 1, borderTopColor: t.line, marginTop: 10, marginBottom: 8 },
    itemRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    itemName: { color: t.ink, flex: 1, paddingRight: 12 },
    itemMeta: { color: t.faint },
    itemVal: { color: t.brand },
    sumRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
    sumRot: { color: t.muted },
    sumTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 4 },
    sumTotal: { color: t.brand, fontFamily: "Helvetica-Bold" },
    fxBox: { marginTop: 16, borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 12 },
    fxText: { fontSize: 8, color: t.muted },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: t.faint },
  });
}

type Styles = ReturnType<typeof makeStyles>;

function ItemLinha({ it, s }: { it: PublicQuote["options"][number]["itens"][number]; s: Styles }) {
  return (
    <View style={s.itemRow}>
      <Text style={s.itemName}>
        {it.nome}
        {it.startDate ? (
          <Text style={s.itemMeta}>
            {"  "}
            {fmtData(it.startDate)}
            {it.endDate ? ` a ${fmtData(it.endDate)}` : ""}
          </Text>
        ) : null}
      </Text>
      <Text style={s.itemVal}>{fmtMoeda(it.grossAmount, it.currency)}</Text>
    </View>
  );
}

function OpcaoBloco({
  op,
  fx,
  s,
}: {
  op: PublicQuote["options"][number];
  fx: PublicQuote["fx"];
  s: Styles;
}) {
  const temDesconto = op.descontos > 0;
  const conv =
    fx.necessario && op.liquidoConvertido != null
      ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency)
      : null;
  return (
    <View style={s.card} wrap={false}>
      <View style={s.optHeaderRow}>
        <View>
          <Text style={s.optTitle}>{op.label}</Text>
          {op.isRecommended ? <Text style={s.badge}>Recomendada</Text> : null}
        </View>
        <View style={s.totalCol}>
          {temDesconto ? (
            <Text style={s.strike}>{fmtMoeda(op.bruto + op.taxas, op.currency)}</Text>
          ) : null}
          <Text style={s.total}>{fmtMoeda(op.liquido, op.currency)}</Text>
          {conv ? <Text style={s.totalConv}>~ {conv}</Text> : null}
        </View>
      </View>

      <View style={s.sep} />

      {op.itens.map((it, i) => (
        <ItemLinha key={i} it={it} s={s} />
      ))}

      <View style={{ marginTop: 8 }}>
        <View style={s.sumRow}>
          <Text style={s.sumRot}>Subtotal</Text>
          <Text>{fmtMoeda(op.bruto, op.currency)}</Text>
        </View>
        {op.taxas > 0 ? (
          <View style={s.sumRow}>
            <Text style={s.sumRot}>Taxas</Text>
            <Text>{fmtMoeda(op.taxas, op.currency)}</Text>
          </View>
        ) : null}
        {op.descontos > 0 ? (
          <View style={s.sumRow}>
            <Text style={s.sumRot}>Descontos</Text>
            <Text>- {fmtMoeda(op.descontos, op.currency)}</Text>
          </View>
        ) : null}
        <View style={s.sumTotalRow}>
          <Text style={s.sumTotal}>Total</Text>
          <Text style={s.sumTotal}>{fmtMoeda(op.liquido, op.currency)}</Text>
        </View>
        {op.depositAmount != null ? (
          <View style={s.sumRow}>
            <Text style={s.sumRot}>Entrada</Text>
            <Text>{fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Gera o PDF da cotacao. `optionIndex` opcional: quando informado, o PDF traz
 * apenas aquela opcao (ex.: baixar so a opcao escolhida); senao, todas.
 */
export async function renderQuotePdf(
  data: PublicQuote,
  optionIndex?: number,
): Promise<Buffer> {
  const options =
    typeof optionIndex === "number"
      ? data.options.filter((o) => o.index === optionIndex)
      : data.options;

  // Tema de impressao do tenant da cotacao (default seguro = EXP Tour).
  const t = getTenantBrand(data.brandSlug).pdf;
  const s = makeStyles(t);

  const doc = (
    <Document title={`Cotacao ${data.reference}`} author={data.brand}>
      <Page size="A4" style={s.page}>
        <View style={s.headerBar} fixed>
          <View style={s.brandRow}>
            <Text style={s.brandWord}>{t.wordmark}</Text>
            {t.dot ? <Text style={s.brandDot}>.</Text> : null}
          </View>
          {t.tagline ? <Text style={s.brandSub}>{t.tagline}</Text> : null}
        </View>

        <View style={s.body}>
          <Text style={s.h1}>
            {data.studentFirstName ? `Ola, ${data.studentFirstName}` : "Sua cotacao"}
          </Text>
          <Text style={s.intro}>
            {data.brand} preparou {options.length}{" "}
            {options.length === 1 ? "opcao" : "opcoes"} para voce
            {data.validUntil ? `. Valida ate ${fmtData(data.validUntil)}.` : "."}
          </Text>

          {data.consultant ? (
            <View style={s.card}>
              <Text style={s.label}>Seu consultor</Text>
              <Text style={{ color: t.brand, marginTop: 2 }}>
                {data.consultant.nome ?? `Equipe ${data.brand}`}
              </Text>
              {data.consultant.email ? (
                <Text style={{ color: t.muted, fontSize: 9 }}>{data.consultant.email}</Text>
              ) : null}
            </View>
          ) : null}

          {options.map((op) => (
            <OpcaoBloco key={op.index} op={op} fx={data.fx} s={s} />
          ))}

          {data.fx.necessario ? (
            <View style={s.fxBox}>
              <Text style={s.fxText}>
                Conversao {data.fx.sourceCurrency} para {data.fx.presentmentCurrency} pela taxa{" "}
                {data.fx.rate?.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}
                {data.fx.rateAt ? `, de ${fmtData(data.fx.rateAt)}` : ""} (congelada nesta cotacao).
              </Text>
              {data.fx.disclaimer ? (
                <Text style={[s.fxText, { marginTop: 3 }]}>{data.fx.disclaimer}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={s.footer} fixed>
          Cotacao {data.reference} · valores congelados na emissao.
        </Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
