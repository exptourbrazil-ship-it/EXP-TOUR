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

const BRAND = "#0f3d3e";
const GOLD = "#8a6d3b";
const INK = "#1f2937";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";

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

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  headerBar: { backgroundColor: BRAND, paddingVertical: 20, paddingHorizontal: 40 },
  brandWord: { color: "#ffffff", fontSize: 18, letterSpacing: 4, fontFamily: "Helvetica-Bold" },
  brandSub: { color: GOLD, fontSize: 7, letterSpacing: 3, marginTop: 2 },
  body: { paddingHorizontal: 40, paddingTop: 24 },
  h1: { fontSize: 20, color: BRAND, fontFamily: "Helvetica-Bold" },
  intro: { fontSize: 10, color: MUTED, marginTop: 4 },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 14, marginTop: 14 },
  label: { fontSize: 7, color: FAINT, letterSpacing: 1, textTransform: "uppercase" },
  optHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  optTitle: { fontSize: 14, color: BRAND, fontFamily: "Helvetica-Bold" },
  badge: { alignSelf: "flex-start", marginTop: 4, backgroundColor: "#efe7d6", color: GOLD, fontSize: 7, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  totalCol: { alignItems: "flex-end" },
  strike: { fontSize: 8, color: FAINT, textDecoration: "line-through" },
  total: { fontSize: 15, color: BRAND, fontFamily: "Helvetica-Bold" },
  totalConv: { fontSize: 8, color: MUTED, marginTop: 1 },
  sep: { borderTopWidth: 1, borderTopColor: LINE, marginTop: 10, marginBottom: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  itemName: { color: INK, flex: 1, paddingRight: 12 },
  itemMeta: { color: FAINT },
  itemVal: { color: BRAND },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  sumRot: { color: MUTED },
  sumTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 },
  sumTotal: { color: BRAND, fontFamily: "Helvetica-Bold" },
  fxBox: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12 },
  fxText: { fontSize: 8, color: MUTED },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: FAINT },
});

function ItemLinha({ it }: { it: PublicQuote["options"][number]["itens"][number] }) {
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
}: {
  op: PublicQuote["options"][number];
  fx: PublicQuote["fx"];
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
        <ItemLinha key={i} it={it} />
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

  const doc = (
    <Document title={`Cotacao ${data.reference}`} author="EXP Tour">
      <Page size="A4" style={s.page}>
        <View style={s.headerBar} fixed>
          <Text style={s.brandWord}>EXP TOUR</Text>
          <Text style={s.brandSub}>TRAVEL EXPERIENCE</Text>
        </View>

        <View style={s.body}>
          <Text style={s.h1}>
            {data.studentFirstName ? `Ola, ${data.studentFirstName}!` : "Sua cotacao"}
          </Text>
          <Text style={s.intro}>
            {data.brand} preparou {options.length}{" "}
            {options.length === 1 ? "opcao" : "opcoes"} para voce
            {data.validUntil ? `. Valida ate ${fmtData(data.validUntil)}.` : "."}
          </Text>

          {data.consultant ? (
            <View style={s.card}>
              <Text style={s.label}>Seu consultor</Text>
              <Text style={{ color: BRAND, marginTop: 2 }}>
                {data.consultant.nome ?? "Equipe EXP Tour"}
              </Text>
              {data.consultant.email ? (
                <Text style={{ color: MUTED, fontSize: 9 }}>{data.consultant.email}</Text>
              ) : null}
            </View>
          ) : null}

          {options.map((op) => (
            <OpcaoBloco key={op.index} op={op} fx={data.fx} />
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
