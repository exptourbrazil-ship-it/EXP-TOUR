// Geracao do PDF da cotacao (portal do estudante) — SERVER-ONLY.
// Usa @react-pdf/renderer (JS puro, sem headless browser) para produzir um PDF
// de marca a partir da fotografia publica (getPublicQuote), no formato Edvisor:
// por opcao -> Cursos/Acomodacao (com Quick Info), Sobre a escola, Price
// Breakdown (taxas linha a linha) e Plano de pagamento; alem de Notes e Sobre
// nos. NUNCA importar em codigo client.
//
// CAMBIO: os valores na MOEDA do curso vem congelados na emissao; a conversao
// em R$ (op.liquidoConvertido / fx.rate) ja vem FLUTUANTE de getPublicQuote —
// e a cotacao do DIA em que o PDF e gerado (mesma regra do portal e do Pix).
// Aqui so formatamos; nao ha nada "congelado" na conversao.
import {
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PublicQuote } from "@/lib/quote-issue-service";
import { getTenantBrand, type PdfTheme } from "@/lib/tenant-brand";
import { INTER_REGULAR_TTF, INTER_MEDIUM_TTF } from "@/lib/fonts/inter";

// Registra a Inter (400/500) uma unica vez. As fontes vao embutidas como data
// URI (ver src/lib/fonts/inter.ts) — sem dependencia de filesystem/rede em
// runtime serverless. So a Forio usa Inter; a EXP Tour segue no Helvetica
// padrao do react-pdf. Idempotente por processo.
let interRegistrada = false;
function registrarInter() {
  if (interRegistrada) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: INTER_REGULAR_TTF, fontWeight: 400 },
      { src: INTER_MEDIUM_TTF, fontWeight: 500 },
    ],
  });
  interRegistrada = true;
}

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
// F5: prazo da promocao (congelado na cotacao). Passado o prazo, sinaliza em vez
// de sumir — o valor cotado continua o mesmo (fotografia), so a leitura muda.
function rotuloPrazo(validoAte: string | null): string {
  if (!validoAte) return "";
  const hoje = new Date().toISOString().slice(0, 10);
  return validoAte < hoje
    ? `  prazo da promoção encerrado em ${fmtData(validoAte)}`
    : `  válida até ${fmtData(validoAte)}`;
}

function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// HTML -> texto plano. O react-pdf nao renderiza HTML; a descricao/notas ja vem
// SANITIZADA de getPublicQuote (allowlist), entao aqui so removemos as tags,
// decodificamos as poucas entidades comuns e colapsamos o espaco em branco.
// Corta ao teto para nao estourar o layout.
function htmlParaTexto(html: string | null | undefined, teto = 600): string {
  if (!html) return "";
  const semTags = String(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const decodificado = semTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  const limpo = decodificado.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return limpo.length > teto ? `${limpo.slice(0, teto - 1).trimEnd()}…` : limpo;
}

// Campo de TEXTO PLANO (nao-HTML): so colapsa espaco e corta ao teto. Usado
// para plano.notes / plano.method, que o portal exibe literalmente (JSX escapa,
// sem dangerouslySetInnerHTML). Nao remove "<...>" para nao mutilar texto como
// "menores <18" — o objetivo e paridade exata com o portal.
function textoPlano(v: string | null | undefined, teto = 300): string {
  if (!v) return "";
  const limpo = String(v).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return limpo.length > teto ? `${limpo.slice(0, teto - 1).trimEnd()}…` : limpo;
}

// Estilos derivados do tema de PDF do tenant (cores de impressao). A faixa do
// cabecalho ganha regua inferior so quando t.barLine existe (letterhead claro
// da Forio); a EXP Tour mantem a faixa verde sem regua.
function makeStyles(t: PdfTheme) {
  // Enfase (titulos/totais): familia bold do tenant. Para Inter, a enfase e o
  // peso 500 (Medium) na mesma familia; para Helvetica, a familia "-Bold".
  const bold = { fontFamily: t.fontBold, ...(t.boldWeight ? { fontWeight: t.boldWeight } : {}) };
  return StyleSheet.create({
    page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontSize: 10, color: t.ink, fontFamily: t.font },
    headerBar: {
      backgroundColor: t.bar,
      paddingVertical: 20,
      paddingHorizontal: 40,
      ...(t.barLine ? { borderBottomWidth: 2, borderBottomColor: t.barLine } : {}),
    },
    brandRow: { flexDirection: "row", alignItems: "flex-end" },
    brandWord: { color: t.wordFg, fontSize: 18, letterSpacing: t.dot ? 0 : 4, ...bold },
    brandDot: { color: t.dot ?? t.wordFg, fontSize: 18, ...bold },
    brandSub: { color: t.sub, fontSize: 7, letterSpacing: 3, marginTop: 2 },
    body: { paddingHorizontal: 40, paddingTop: 24 },
    h1: { fontSize: 20, color: t.brand, ...bold },
    intro: { fontSize: 10, color: t.muted, marginTop: 4 },
    metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    metaItem: { fontSize: 8, color: t.faint, marginRight: 16 },
    card: { borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 14, marginTop: 14 },
    label: { fontSize: 7, color: t.faint, letterSpacing: 1, textTransform: "uppercase" },
    optHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    optTitle: { fontSize: 14, color: t.brand, ...bold },
    badge: { alignSelf: "flex-start", marginTop: 4, backgroundColor: t.accentSoft, color: t.accentInk, fontSize: 7, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
    totalCol: { alignItems: "flex-end" },
    strike: { fontSize: 8, color: t.faint, textDecoration: "line-through" },
    total: { fontSize: 15, color: t.brand, ...bold },
    totalConv: { fontSize: 8, color: t.muted, marginTop: 1 },
    sep: { borderTopWidth: 1, borderTopColor: t.line, marginTop: 10, marginBottom: 8 },
    // Blocos internos da opcao (Edvisor)
    secTitle: { fontSize: 8, color: t.faint, letterSpacing: 1, textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
    itemRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    itemName: { color: t.ink, flex: 1, paddingRight: 12 },
    itemMeta: { color: t.faint },
    itemVal: { color: t.brand },
    detalheLinha: { fontSize: 8, color: t.muted, marginTop: 2, paddingRight: 12 },
    escolaNome: { color: t.ink, ...bold, fontSize: 10 },
    escolaLocal: { fontSize: 8, color: t.faint },
    escolaDesc: { fontSize: 8, color: t.muted, marginTop: 3, lineHeight: 1.4 },
    chipsLinha: { fontSize: 8, color: t.muted, marginTop: 3 },
    sumRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
    sumRot: { color: t.muted, flex: 1, paddingRight: 12 },
    sumTag: { fontSize: 7, color: t.faint },
    sumTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 4 },
    sumTotal: { color: t.brand, ...bold },
    planoRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
    planoSeq: { color: t.muted, width: 90 },
    planoData: { color: t.ink, flex: 1 },
    planoVal: { color: t.ink },
    planoNota: { fontSize: 8, color: t.faint, marginTop: 3 },
    fxBox: { marginTop: 16, borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 12 },
    fxText: { fontSize: 8, color: t.muted },
    notesText: { fontSize: 9, color: t.ink, marginTop: 4, lineHeight: 1.4 },
    notaData: { fontSize: 7.5, color: t.muted, marginTop: 6 },
    aboutText: { fontSize: 8, color: t.muted, marginTop: 3, lineHeight: 1.4 },
    contatoLinha: { fontSize: 8, color: t.muted, marginTop: 2 },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: t.faint },
  });
}

type Styles = ReturnType<typeof makeStyles>;
type Opcao = PublicQuote["options"][number];

// Linha compacta de "Quick Info" (curso) ou atributos (acomodacao): junta
// rotulo/valor com " · ", cortando ao teto para nao virar paragrafo.
function linhaQuickInfo(linhas: { rotulo: string; valor: string }[], max = 6): string {
  return linhas
    .filter((l) => l.valor)
    .slice(0, max)
    .map((l) => (l.rotulo ? `${l.rotulo}: ${l.valor}` : l.valor))
    .join("  ·  ");
}

function ItemLinha({ it, s }: { it: Opcao["itens"][number]; s: Styles }) {
  const quick = it.detalhes?.programa ? linhaQuickInfo(it.detalhes.programa.quickInfo) : "";
  const acom = it.detalhes?.acomodacao ? linhaQuickInfo(it.detalhes.acomodacao.linhas) : "";
  const detalhe = quick || acom;
  return (
    <View wrap={false}>
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
      {detalhe ? <Text style={s.detalheLinha}>{detalhe}</Text> : null}
    </View>
  );
}

// "Sobre a escola" — resumo do campus (nome, local, descricao curta, amenities/
// acreditacoes/nacionalidades). Renderizado uma vez por opcao quando ha campus.
function EscolaResumo({ esc, s }: { esc: NonNullable<Opcao["itens"][number]["detalhes"]["escola"]>; s: Styles }) {
  const desc = htmlParaTexto(esc.descriptionHtml, 400);
  const amen = esc.amenities.slice(0, 8).join(" · ");
  const acred = esc.accreditations.slice(0, 6).join(" · ");
  const nac = esc.nationalityMix.slice(0, 6).map((n) => `${n.pais} ${n.percentual}%`).join("  ·  ");
  if (!esc.nome && !desc && !amen && !acred && !nac) return null;
  return (
    <View wrap={false}>
      <Text style={s.secTitle}>Sobre a escola</Text>
      {esc.nome ? <Text style={s.escolaNome}>{esc.nome}</Text> : null}
      {esc.local ? <Text style={s.escolaLocal}>{esc.local}</Text> : null}
      {desc ? <Text style={s.escolaDesc}>{desc}</Text> : null}
      {amen ? <Text style={s.chipsLinha}>Comodidades: {amen}</Text> : null}
      {acred ? <Text style={s.chipsLinha}>Acreditações: {acred}</Text> : null}
      {nac ? <Text style={s.chipsLinha}>Nacionalidades: {nac}</Text> : null}
    </View>
  );
}

function OpcaoBloco({ op, fx, s }: { op: Opcao; fx: PublicQuote["fx"]; s: Styles }) {
  const temDesconto = op.descontos > 0;
  const conv =
    op.liquidoConvertido != null
      ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency)
      : null;
  // Escola: pega o primeiro item com bloco de escola (todos de uma opcao
  // costumam apontar ao mesmo campus).
  const escola = op.itens.map((it) => it.detalhes?.escola).find((e) => !!e) ?? null;
  const plano = op.planoPagamento;

  return (
    <View style={s.card}>
      <View style={s.optHeaderRow} wrap={false}>
        <View>
          <Text style={s.optTitle}>{op.label}</Text>
          {op.isRecommended ? <Text style={s.badge}>Recomendada</Text> : null}
        </View>
        <View style={s.totalCol}>
          {temDesconto ? (
            <Text style={s.strike}>{fmtMoeda(op.bruto + op.taxas, op.currency)}</Text>
          ) : null}
          <Text style={s.total}>{fmtMoeda(op.liquido, op.currency)}</Text>
          {conv ? <Text style={s.totalConv}>~ {conv} (câmbio do dia)</Text> : null}
        </View>
      </View>

      <View style={s.sep} />

      {/* Cursos / Acomodacao / Servicos */}
      <Text style={s.secTitle}>Itens da opção</Text>
      {op.itens.map((it, i) => (
        <ItemLinha key={i} it={it} s={s} />
      ))}

      {escola ? <EscolaResumo esc={escola} s={s} /> : null}

      {/* Price Breakdown (taxas linha a linha) */}
      <Text style={s.secTitle}>Detalhamento do preço</Text>
      {/* Mesma leitura da tela: cada taxa abaixo do item que ela encarece, e as
          de cotacao inteira separadas. Divergir do link faria o cliente comparar
          dois documentos que nao batem. */}
      {op.itens.map((it, i) => {
        const suas = op.taxasDetalhadas.filter(
          (tx) => tx.basis !== "once_per_quote" && tx.itemIndex === i,
        );
        return (
          <View key={i} wrap={false}>
            <View style={s.sumRow}>
              <Text style={s.sumRot}>{it.nome}</Text>
              <Text>{fmtMoeda(it.grossAmount, it.currency)}</Text>
            </View>
            {suas.map((tx, k) => (
              <View key={k} style={s.sumRow}>
                <Text style={s.sumRot}>
                  {"    "}
                  {tx.nome}
                  {tx.isRefundable === true ? <Text style={s.sumTag}>  reembolsável</Text> : null}
                  {tx.isRefundable === false ? <Text style={s.sumTag}>  não reembolsável</Text> : null}
                </Text>
                <Text>{fmtMoeda(tx.amount, tx.currency)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      {op.taxasDetalhadas
        .filter((tx) => tx.basis === "once_per_quote" || tx.itemIndex == null || tx.itemIndex >= op.itens.length)
        .map((tx, i) => (
          <View key={`q${i}`} style={s.sumRow} wrap={false}>
            <Text style={s.sumRot}>
              {tx.nome}
              {tx.isRefundable === false ? <Text style={s.sumTag}>  não reembolsável</Text> : null}
            </Text>
            <Text>{fmtMoeda(tx.amount, tx.currency)}</Text>
          </View>
        ))}
      {/* Descontos linha a linha (F5): promocao com PRAZO congelado ("valida ate" /
          "prazo encerrado"); manuais saem como "Desconto comercial". A soma das
          linhas E o agregado `op.descontos` (mesmas linhas). */}
      {op.descontosDetalhados.map((d, i) => (
        <View key={i} style={s.sumRow} wrap={false}>
          <Text style={s.sumRot}>
            {d.promocao ? "Promoção: " : "Desconto: "}
            {d.nome}
            {d.validoAte ? <Text style={s.sumTag}>{rotuloPrazo(d.validoAte)}</Text> : null}
          </Text>
          <Text>- {fmtMoeda(d.amount, d.currency)}</Text>
        </View>
      ))}
      <View style={s.sumTotalRow} wrap={false}>
        <Text style={s.sumTotal}>Total</Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.sumTotal}>{fmtMoeda(op.liquido, op.currency)}</Text>
          {conv ? <Text style={s.totalConv}>~ {conv} (câmbio do dia)</Text> : null}
        </View>
      </View>
      {op.depositAmount != null ? (
        <View style={s.sumRow}>
          <Text style={s.sumRot}>Entrada</Text>
          <Text>{fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}</Text>
        </View>
      ) : null}

      {/* Plano de pagamento */}
      {plano && plano.parcelas.length > 0 ? (
        <View>
          <Text style={s.secTitle}>Plano de pagamento</Text>
          {plano.parcelas.map((p, i) => (
            <View key={i} style={s.planoRow} wrap={false}>
              <Text style={s.planoSeq}>{p.description || `Parcela ${p.sequence}`}</Text>
              <Text style={s.planoData}>{fmtData(p.dueDate)}</Text>
              <Text style={s.planoVal}>{fmtMoeda(p.amount, p.currency)}</Text>
            </View>
          ))}
          {plano.method ? <Text style={s.planoNota}>Forma de pagamento: {textoPlano(plano.method, 80)}</Text> : null}
          {plano.notes ? <Text style={s.planoNota}>{textoPlano(plano.notes, 300)}</Text> : null}
        </View>
      ) : null}
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

  // Taxa do dia por moeda, a partir das opcoes DESTE documento (cada opcao ja
  // carrega o seu VET). Uma cotacao pode comparar destinos em moedas diferentes.
  const taxasPorMoeda = (() => {
    const m = new Map<string, { moeda: string; vet: number; vetAt: string | null }>();
    for (const op of options) {
      if (op.currency === data.fx.presentmentCurrency || op.vet == null) continue;
      if (!m.has(op.currency)) m.set(op.currency, { moeda: op.currency, vet: op.vet, vetAt: op.vetAt });
    }
    return [...m.values()].sort((a, b) => a.moeda.localeCompare(b.moeda));
  })();

  // Tema de impressao do tenant da cotacao (default seguro = EXP Tour).
  const t = getTenantBrand(data.brandSlug).pdf;
  if (t.font === "Inter") registrarInter();
  const s = makeStyles(t);

  const notes = htmlParaTexto(data.notesHtml, 1500);
  // Atualizacoes pos-emissao. Entram no PDF porque o documento e baixado
  // DEPOIS: sem elas, quem imprime apos o recado leva um papel que contradiz o
  // link. Ordem cronologica (a leitura do portal vem da mais nova).
  const atualizacoes = [...data.notas]
    .reverse()
    .map((n) => ({ quando: fmtData(n.createdAt), texto: htmlParaTexto(n.bodyHtml, 600) }))
    .filter((n) => n.texto !== "")
    .slice(0, 20);
  const about = htmlParaTexto(data.aboutUs.html, 1500);
  const a = data.aboutUs;

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
          <View style={s.metaRow}>
            <Text style={s.metaItem}>Cotacao {data.reference}</Text>
            {data.issuedOn ? <Text style={s.metaItem}>Emitida em {fmtData(data.issuedOn)}</Text> : null}
            {data.consultant?.nome ? <Text style={s.metaItem}>Preparada por {data.consultant.nome}</Text> : null}
          </View>

          {data.consultant ? (
            <View style={s.card} wrap={false}>
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
            <View style={s.fxBox} wrap={false}>
              {/* Com opcoes em moedas diferentes nao ha UMA taxa: lista a de cada
                  moeda, que e como cada opcao foi convertida. */}
              {taxasPorMoeda.length > 1 ? (
                <Text style={s.fxText}>
                  As opcoes estao em moedas diferentes; cada uma foi convertida para{" "}
                  {data.fx.presentmentCurrency} pela cotacao do dia da sua moeda:{" "}
                  {taxasPorMoeda
                    .map(
                      (t) =>
                        `1 ${t.moeda} = ${t.vet.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}${t.vetAt ? ` (${fmtData(t.vetAt)})` : ""}`,
                    )
                    .join("; ")}
                  .
                </Text>
              ) : (
                <Text style={s.fxText}>
                  Conversao {data.fx.sourceCurrency ?? taxasPorMoeda[0]?.moeda} para {data.fx.presentmentCurrency} pela cotacao do dia
                  {data.fx.rateAt ? ` (${fmtData(data.fx.rateAt)})` : ""}: 1{" "}
                  {data.fx.sourceCurrency ?? taxasPorMoeda[0]?.moeda} ={" "}
                  {(data.fx.rate ?? taxasPorMoeda[0]?.vet)?.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}{" "}
                  {data.fx.presentmentCurrency}.
                </Text>
              )}
              <Text style={[s.fxText, { marginTop: 3 }]}>
                O valor na moeda do curso e fixo; o R$ e recalculado pela cotacao do dia sempre que este documento e gerado
                {data.fx.source ? ` (${data.fx.source})` : ""}.
              </Text>
              {data.fx.disclaimer ? (
                <Text style={[s.fxText, { marginTop: 3 }]}>{data.fx.disclaimer}</Text>
              ) : null}
            </View>
          ) : null}

          {notes || atualizacoes.length > 0 ? (
            <View style={s.card} wrap={false}>
              <Text style={s.label}>Observacoes</Text>
              {notes ? <Text style={s.notesText}>{notes}</Text> : null}
              {atualizacoes.map((n, i) => (
                <View key={`nota-${i}`}>
                  <Text style={s.notaData}>Atualizacao de {n.quando}</Text>
                  <Text style={s.notesText}>{n.texto}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {about || a.website || a.email || a.phone || a.address ? (
            <View style={s.card} wrap={false}>
              <Text style={s.label}>Sobre {data.brand}</Text>
              {about ? <Text style={s.aboutText}>{about}</Text> : null}
              {a.website ? <Text style={s.contatoLinha}>{a.website}</Text> : null}
              {a.email ? <Text style={s.contatoLinha}>{a.email}</Text> : null}
              {a.phone ? <Text style={s.contatoLinha}>{a.phone}</Text> : null}
              {a.address ? <Text style={s.contatoLinha}>{a.address}</Text> : null}
            </View>
          ) : null}
        </View>

        <Text style={s.footer} fixed>
          Cotacao {data.reference} · valor na moeda do curso fixo · R$ pela cotacao do dia.
        </Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
