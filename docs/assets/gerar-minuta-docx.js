/*
 * gerar-minuta-docx.js — Gerador do .docx da minuta de câmbio (spread 5%)
 * ---------------------------------------------------------------------------
 * Reproduz, com a identidade visual da Forio, o conteúdo de
 * `docs/minuta-clausulas-cambio-contrato-mestre.md` em um arquivo Word (.docx),
 * embutindo a marca oficial (`docs/assets/forio-mark.png`, o "F" sobre a barra
 * Sky Indigo). A fonte de verdade do TEXTO continua sendo o `.md`: ao editar as
 * cláusulas, altere primeiro o Markdown e depois espelhe aqui.
 *
 * Este script NÃO faz parte do build do app — é um utilitário de documentação e,
 * por isso, `docx` NÃO está em `package.json` (para não inflar as dependências
 * do portal). Para rodar, instale a lib de forma isolada:
 *
 *     npm i --no-save docx
 *     node docs/assets/gerar-minuta-docx.js [caminho/de/saida.docx]
 *
 * Sem argumento, o arquivo é gerado em
 * `docs/minuta-clausulas-cambio-contrato-mestre.docx` (ao lado do .md fonte).
 *
 * Nota: a geração é pura (docx-js), sem LibreOffice/pandoc. O PNG da marca é lido
 * de `docs/assets/forio-mark.png` — o mesmo traço do componente `BrandLogo`.
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Footer, PageNumber, TabStopType, ImageRun,
} = require("docx");
const fs = require("fs");
const path = require("path");

const MARK_PNG = fs.readFileSync(path.join(__dirname, "forio-mark.png")); // marca oficial (Night + F + barra Sky Indigo)
const OUTPUT = process.argv[2] || path.join(__dirname, "..", "minuta-clausulas-cambio-contrato-mestre.docx");

// ---- Identidade Forio -------------------------------------------------------
const FONT = "Inter";
const NIGHT = "0F1020";      // texto forte / "For"
const SKY = "7080F4";        // Sky Indigo — EXCLUSIVO do logotipo ("io")
const BLUE = "3B4DC9";       // Portal Blue (acento de UI)
const AMBER = "E8A838";      // Amber Gate (atenção)
const CONF = "1C8C6A";       // Confirmed (sucesso)
const MIST = "F4F5FF";       // fundo claro
const INK = "23252F";        // corpo
const MUTED = "6B6E7E";      // secundário

// Mini-parser de **negrito**.
function runs(text, base = {}) {
  const out = [];
  for (const part of String(text).split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    const bold = part.startsWith("**") && part.endsWith("**");
    out.push(new TextRun({ text: bold ? part.slice(2, -2) : part, bold, font: FONT, size: 22, color: INK, ...base }));
  }
  return out;
}
function p(text, opts = {}) {
  return new Paragraph({
    children: runs(text),
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 160, line: 276 },
  });
}
function bullet(text) {
  return new Paragraph({ children: runs(text), bullet: { level: 0 }, spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED });
}
function nota(lines) {
  return lines.map((t, i) =>
    new Paragraph({
      children: runs(t, { color: NIGHT }),
      spacing: { after: i === lines.length - 1 ? 180 : 60, line: 264 },
      shading: { type: ShadingType.CLEAR, fill: MIST },
      border: {
        top: i === 0 ? { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 6 } : undefined,
        bottom: i === lines.length - 1 ? { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 6 } : undefined,
        left: { style: BorderStyle.SINGLE, size: 20, color: BLUE, space: 10 },
        right: { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 6 },
      },
    })
  );
}
function mono(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Consolas", size: 22, bold: true, color: NIGHT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 160 },
    shading: { type: ShadingType.CLEAR, fill: MIST },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: AMBER, space: 8 } },
  });
}
function ruleBlue() {
  return new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 2 } }, children: [] });
}

// ---- Logo lockup "Forio" (marca + wordmark) --------------------------------
const NOBORD = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } };
function logoLockup() {
  return new Table({
    columnWidths: [700, 8660],
    width: { size: 9360, type: WidthType.DXA },
    borders: NOBORD,
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: 700, type: WidthType.DXA },
        verticalAlign: "center",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: NOBORD,
        children: [new Paragraph({ spacing: { after: 0 }, children: [
          new ImageRun({ type: "png", data: MARK_PNG, transformation: { width: 42, height: 42 } }),
        ] })],
      }),
      new TableCell({
        width: { size: 8660, type: WidthType.DXA },
        verticalAlign: "center",
        margins: { top: 0, bottom: 0, left: 170, right: 0 },
        borders: NOBORD,
        children: [
          new Paragraph({ spacing: { after: 0 }, children: [
            new TextRun({ text: "For", bold: true, font: FONT, size: 40, color: NIGHT }),
            new TextRun({ text: "io", bold: true, font: FONT, size: 40, color: SKY }),
          ] }),
          new Paragraph({ spacing: { before: 20, after: 0 }, children: [new TextRun({ text: "Área do Cliente · Documento contratual", font: FONT, size: 16, color: MUTED })] }),
        ],
      }),
    ] })],
  });
}
function h(text, level) {
  return new Paragraph({ heading: level, keepNext: true, children: [new TextRun({ text, font: FONT })] });
}

// ---- Tabela do exemplo (Anexo II) ------------------------------------------
function cell(text, { w, bold = false, fill, color = INK } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 110, right: 110 },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text, bold, font: FONT, size: 20, color })] })],
  });
}
function exampleTable() {
  const cw = [6360, 3000];
  const row = (a, b, o = {}) => new TableRow({ children: [cell(a, { w: cw[0], bold: o.bold, fill: o.fill, color: o.color }), cell(b, { w: cw[1], bold: o.bold, fill: o.fill, color: o.color })] });
  return new Table({
    columnWidths: cw,
    width: { size: 9360, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "D9DCEC" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "D9DCEC" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "D9DCEC" }, right: { style: BorderStyle.SINGLE, size: 2, color: "D9DCEC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "ECEEF8" }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "ECEEF8" },
    },
    rows: [
      row("Componente", "Valor", { bold: true, fill: NIGHT, color: "FFFFFF" }),
      row("PTAX de venda", "4,0000"),
      row("Subtotal convertido (PTAX × valor)", "R$ 4.000,00"),
      row("Taxa de Intermediação e Câmbio (5% do subtotal)", "R$ 200,00"),
      row("IOF-câmbio (3,5% do subtotal)", "R$ 140,00"),
      row("Total em reais", "R$ 4.340,00", { bold: true, fill: "E6F3EE", color: CONF }),
      row("Fator de Conversão equivalente (1 + 0,05 + 0,035)", "1,085"),
    ],
  });
}

// ---- Conteúdo ---------------------------------------------------------------
const children = [];
children.push(logoLockup());
children.push(new Paragraph({ spacing: { before: 160, after: 40 }, children: [new TextRun({ text: "Minuta — Cláusulas de Câmbio do Contrato-Mestre", bold: true, font: FONT, size: 32, color: NIGHT })] }));
children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Taxa de Intermediação e Câmbio: 5% (modelo aditivo)", font: FONT, size: 24, color: BLUE })] }));
children.push(ruleBlue());

nota([
  "Natureza deste documento. Minuta de redação das cláusulas de conversão cambial das Condições Gerais e do Anexo II, atualizadas para a Taxa de Intermediação e Câmbio de 5% (modelo aditivo), consistente com o comportamento do sistema. NÃO substitui revisão jurídica. Termos entre [colchetes] são decisões do jurídico/financeiro.",
  "Numeração alinhada ao mapa de contrato-arquitetura (6.3 Saldo Devedor · 6.4 conversão cambial/Anexo II · 6.5/6.5.2 cobrança e recibo · 6.7 simulação não vinculante · 6.9 vigência).",
]).forEach((n) => children.push(n));

children.push(h("Cláusula 6.3 — Saldo Devedor na moeda de referência", HeadingLevel.HEADING_2));
children.push(p("6.3. O preço dos serviços e do programa é **denominado na moeda de referência** indicada no Quadro Resumo (a “Moeda de Referência”), e a obrigação do CONTRATANTE é expressa e permanece **nessa moeda** até a sua efetiva quitação."));
children.push(p("6.3.1. Entende-se por “Saldo Devedor” o somatório dos valores, na Moeda de Referência, ainda não amortizados pelo CONTRATANTE. Cada pagamento **amortiza** o Saldo Devedor pelo valor, na Moeda de Referência, a ele correspondente."));
children.push(p("6.3.2. A conversão para reais (BRL) ocorre **exclusivamente no momento de cada pagamento**, na forma da Cláusula 6.4, não havendo congelamento antecipado da taxa nem vinculação a qualquer simulação prévia (Cláusula 6.7)."));

children.push(h("Cláusula 6.4 — Conversão cambial (Anexo II)", HeadingLevel.HEADING_2));
children.push(p("6.4. O valor em reais (BRL) de cada amortização é obtido pela aplicação, ao valor amortizado na Moeda de Referência, do **Fator de Conversão do dia do pagamento**, apurado conforme o Anexo II, pela fórmula:"));
children.push(mono("Valor em BRL = Valor amortizado × PTAX_venda × (1 + Taxa de Intermediação e Câmbio + IOF-câmbio)"));
children.push(p("6.4.1. **PTAX de venda.** “PTAX_venda” é a cotação de **venda** da moeda, divulgada pelo **Banco Central do Brasil**, [Turismo/Comercial], relativa à data de referência do pagamento (ou, na sua ausência para a data, a **última cotação divulgada imediatamente anterior**)."));
children.push(p("6.4.2. **Taxa de Intermediação e Câmbio.** Incide o percentual de **5% (cinco por cento)**, a título de Taxa de Intermediação e Câmbio, correspondente à **remuneração de serviço** da CONTRATADA pela intermediação e pelo processamento do pagamento internacional. Esta taxa **não constitui operação de câmbio**, que a CONTRATADA não realiza."));
children.push(p("6.4.3. **IOF-câmbio.** Incide o IOF-câmbio, à **alíquota vigente na data** do pagamento (atualmente **3,5%**), calculado sobre o **valor convertido** (PTAX_venda × valor amortizado), abrangendo [mensalidade/tuition, taxas e acomodação, conforme a composição do Quadro Resumo]."));
children.push(p("6.4.4. **Modelo aditivo.** As alíquotas das Cláusulas 6.4.2 e 6.4.3 **somam-se** (fator 1 + 5% + IOF), de modo que o **IOF-câmbio incide sobre o valor convertido, e não sobre a Taxa de Intermediação e Câmbio**."));
children.push(p("6.4.5. **Taxa do dia do pagamento.** A conversão utiliza a cotação e as alíquotas **vigentes na data de cada pagamento** — a obrigação, denominada na Moeda de Referência, **flutua** com o câmbio até a quitação. Não há taxa administrativa fixa adicional por transação."));
children.push(p("6.4.6. **Moedas sem cotação PTAX própria.** Para moeda cuja PTAX não seja divulgada pelo Banco Central [ex.: Dólar Neozelandês — NZD], o câmbio comercial é apurado por **conversão cruzada** entre a paridade da moeda com o Dólar dos Estados Unidos (fonte de referência pública [Banco Central Europeu]) e a PTAX_venda USD/BRL do Banco Central, aplicando-se, sobre o resultado, a mesma fórmula desta Cláusula."));

children.push(h("Cláusula 6.5 — Cobrança via Pix", HeadingLevel.HEADING_2));
children.push(p("6.5. Cada amortização é cobrada por **Pix**, com QR Code/código dinâmico, no valor em reais apurado na forma da Cláusula 6.4 na data da geração da cobrança."));
children.push(p("6.5.1. A cobrança Pix é **válida até as 23h59 do dia** de sua geração; expirada, nova cobrança poderá ser gerada, **recalculando-se** o valor em reais pela cotação e alíquotas então vigentes (Cláusula 6.4.5)."));
children.push(h("Cláusula 6.5.2 — Recibo itemizado", HeadingLevel.HEADING_3));
children.push(p("6.5.2. A cada pagamento confirmado, a CONTRATADA disponibiliza ao CONTRATANTE, na Área do Cliente **e por e-mail**, **recibo itemizado** contendo, no mínimo:"));
["o **valor amortizado na Moeda de Referência**;","a **PTAX de venda** aplicada e a **data** de sua divulgação;","a **Taxa de Intermediação e Câmbio** — percentual (5%) e valor em reais;","o **IOF-câmbio** — alíquota vigente (3,5%) e valor em reais;","o **total pago em reais**; e","o **Saldo Devedor remanescente na Moeda de Referência**."].forEach((t)=>children.push(bullet(t)));
children.push(p("6.5.2.1. O recibo **não conterá** linha de tarifa de remessa ou de operação de câmbio, por não haver, na relação com o CONTRATANTE, cobrança a esse título."));
children.push(p("6.5.2.2. Os componentes do recibo são apurados pelos **mesmos percentuais que compuseram a cotação aplicada na respectiva cobrança**, ainda que os percentuais vigentes tenham sido alterados posteriormente (Cláusula 6.9)."));

children.push(h("Cláusula 6.7 — Simulação em reais não vinculante", HeadingLevel.HEADING_2));
children.push(p("6.7. Quaisquer valores em reais exibidos **antes do pagamento** (inclusive no Quadro Resumo e nas telas da Área do Cliente) constituem **simulação meramente informativa e não vinculante**, calculada pela cotação de um dado momento. A **obrigação do CONTRATANTE é na Moeda de Referência** e o valor em reais de cada pagamento é o apurado no **dia do pagamento**, na forma da Cláusula 6.4."));

children.push(h("Cláusula 6.9 — Vigência da Taxa de Intermediação e Câmbio", HeadingLevel.HEADING_2));
children.push(p("6.9. A Taxa de Intermediação e Câmbio é um parâmetro **vigente** informado pela CONTRATADA, atualmente fixado em **5%**. Eventual alteração:"));
["aplica-se **apenas às cobranças geradas a partir da sua vigência**;","**não afeta** cobranças já geradas nem pagamentos já realizados, cujos recibos permanecem apurados pelo percentual então vigente (Cláusula 6.5.2.2);","é comunicada ao CONTRATANTE e registrada por nota de alteração datada."].forEach((t)=>children.push(bullet(t)));

children.push(h("Anexo II — Metodologia de Apuração Cambial", HeadingLevel.HEADING_2));
children.push(p("**II.1. Fórmula.** O valor em reais de cada pagamento é:"));
children.push(mono("BRL = valor_na_moeda × PTAX_venda × (1 + 0,05 + IOF)"));
children.push(p("onde IOF é a alíquota do IOF-câmbio vigente na data (atualmente 0,035)."));
children.push(p("**II.2. Modelo aditivo.** As alíquotas somam-se; o IOF-câmbio incide sobre o valor convertido (PTAX × valor), não sobre a Taxa de Intermediação e Câmbio."));
children.push(p("**II.3. Componentes divulgados no recibo.** PTAX de venda (e data), Taxa de Intermediação e Câmbio (5% — percentual e valor), IOF-câmbio (alíquota e valor), total em reais e Saldo Devedor remanescente."));
children.push(p("**II.4. Exemplo** (PTAX 4,0000; valor amortizado 1.000,00 na Moeda de Referência)."));
children.push(exampleTable());
children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
children.push(p("**II.5. Moeda sem PTAX própria.** Conversão cruzada conforme a Cláusula 6.4.6."));

children.push(h("Checklist para o jurídico/financeiro", HeadingLevel.HEADING_2));
["Confirmar [Turismo/Comercial] na PTAX de venda (6.4.1).","Confirmar a base do IOF-câmbio (6.4.3): valor convertido de [tuition + taxas + acomodação].","Confirmar a fonte de referência para NZD (6.4.6) — [BCE / outra].","Substituir a numeração/os [colchetes] conforme o contrato-mestre vigente.","Anexar a nota de alteração (nota-alteracao-spread-2026-08) ao dossiê."].forEach((t)=>
  children.push(new Paragraph({ spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: "☐  ", font: FONT, size: 22, color: AMBER, bold: true }), ...runs(t)] })));

// Rodapé de marca (todas as páginas).
const footer = new Footer({ children: [
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2E4F2", space: 6 } },
    children: [
      new TextRun({ text: "For", bold: true, font: FONT, size: 16, color: NIGHT }),
      new TextRun({ text: "io", bold: true, font: FONT, size: 16, color: SKY }),
      new TextRun({ text: "   ·   Minuta — Cláusulas de Câmbio (spread 5%) · minuta para revisão jurídica", font: FONT, size: 16, color: MUTED }),
      new TextRun({ text: "\t", font: FONT }),
      new TextRun({ children: ["Pág. ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED }),
    ],
  }),
] });

const doc = new Document({
  creator: "Forio · EXP Tour",
  title: "Minuta — Cláusulas de Câmbio do Contrato-Mestre (spread 5%)",
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: INK } } },
    paragraphStyles: [
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { bold: true, size: 26, color: NIGHT, font: FONT }, paragraph: { spacing: { before: 260, after: 120 } } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { bold: true, size: 23, color: BLUE, font: FONT }, paragraph: { spacing: { before: 160, after: 80 } } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } },
    footers: { default: footer },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("OK", buf.length, "bytes →", OUTPUT);
});
