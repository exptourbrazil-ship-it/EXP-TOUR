"use client";
import { createElement, useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, labelDoTipoDocumento, categoriaDoTipoDocumento } from "@/lib/documentos";

// Paleta da marca EXP Tour
const VERDE = "#042f1b";
const OURO = "#c9a35e"; // dourado para FUNDOS (botoes) e detalhes
const OURO_TEXTO = "#8a6a2f"; // dourado acessivel para TEXTO/links sobre fundo claro (WCAG AA)
const CREME = "#f5ead9";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Reenviar",
};

// Passo a passo para solicitar o passaporte brasileiro (Policia Federal).
// Valores e detalhes mudam com o tempo -> sempre apontamos para o site oficial.
const PASSOS_PASSAPORTE = [
  "Acesse o site da Polícia Federal (gov.br/pf) e preencha o formulário de solicitação de passaporte.",
  "Emita e pague a GRU (taxa federal) gerada no próprio site.",
  "Agende o atendimento presencial na unidade da PF mais próxima.",
  "No dia, leve documento de identidade original, o comprovante de pagamento da GRU e o protocolo do agendamento.",
  "No atendimento são coletados foto, impressões digitais e assinatura.",
  "Acompanhe a emissão pelo site e retire o passaporte na unidade quando estiver pronto.",
];

const STATUS_COR: Record<string, { texto: string; fundo: string }> = {
  pendente: { texto: "#92600a", fundo: "#fdf3d7" },
  aprovado: { texto: "#15803d", fundo: "#e4f5ea" },
  // Atencao/acao: ambar-laranja (NUNCA vermelho na Area do Cliente).
  rejeitado: { texto: "#9a3412", fundo: "#ffedd5" },
};

function StatusBadge(status: string) {
  const chave = status || "pendente";
  const label = STATUS_LABEL[chave] || STATUS_LABEL.pendente;
  const cor = STATUS_COR[chave] || STATUS_COR.pendente;
  return createElement(
    "span",
    { style: { fontSize: 11, fontWeight: 600, color: cor.texto, background: cor.fundo, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" } },
    label
  );
}

// Ícone de documento (SVG inline) usado em cada linha, no estilo do mockup.
function IconeArquivo() {
  return createElement(
    "div",
    { style: { flex: "0 0 auto", width: 40, height: 40, borderRadius: 10, background: CREME, display: "flex", alignItems: "center", justifyContent: "center" } },
    createElement(
      "svg",
      { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: VERDE, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
      createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
      createElement("polyline", { points: "14 2 14 8 20 8" })
    )
  );
}

// Icone pequeno para os botoes de acao; herda a cor do botao (currentColor).
function iconeAcao(...paths: any[]) {
  return createElement(
    "svg",
    { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", style: { flex: "0 0 auto" } },
    ...paths
  );
}
const iconeBaixar = () =>
  iconeAcao(
    createElement("path", { key: "a", d: "M12 3v11" }),
    createElement("path", { key: "b", d: "m7 11 5 5 5-5" }),
    createElement("path", { key: "c", d: "M5 21h14" })
  );
const iconeReenviar = () =>
  iconeAcao(
    createElement("path", { key: "a", d: "M21 12a9 9 0 1 1-3-6.7" }),
    createElement("path", { key: "b", d: "M21 4v5h-5" })
  );
const iconeLixeira = () =>
  iconeAcao(
    createElement("path", { key: "a", d: "M3 6h18" }),
    createElement("path", { key: "b", d: "M8 6V4h8v2" }),
    createElement("path", { key: "c", d: "M6 6l1 14h10l1-14" })
  );

export default function DocumentosClient({ documentos, afiliadoVistoUrl }: { documentos: any[]; afiliadoVistoUrl?: string | null }) {
  const [documentosState, setDocumentosState] = useState(documentos || []);
  const [tipoUpload, setTipoUpload] = useState({} as Record<string, string>);
  const [enviando, setEnviando] = useState(null as string | null);
  const [excluindo, setExcluindo] = useState(null as string | null);
  const [mensagem, setMensagem] = useState({} as Record<string, string>);
  const [mostrarPassaporte, setMostrarPassaporte] = useState(false);

  const secoes = CATEGORIAS_DOCUMENTO.map((cat) => {
    const tipos = TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor);
    const grupos = tipos
      .map((tipo) => ({ tipo: tipo.valor, itens: documentosState.filter((d) => d.tipo_documento === tipo.valor) }))
      .filter((g) => g.itens.length > 0);
    return { ...cat, tipos, grupos };
  });

  // Cliente só envia documentos do estudante. Escola/financeiro são inseridos pelo admin.
  function podeEnviar(categoria: string) {
    return categoria === "estudante";
  }

  async function enviarArquivo(categoria: string, tipos: any[], e: any) {
    const arquivo: File | null = e.target.files?.[0] || null;
    e.target.value = "";
    if (!arquivo) return;
    const tipoDocumento = tipoUpload[categoria] || tipos[0]?.valor;
    if (!tipoDocumento) return;

    setEnviando(categoria);
    setMensagem((m) => ({ ...m, [categoria]: "" }));
    try {
      const formData = new FormData();
      formData.append("tipoDocumento", tipoDocumento);
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setMensagem((m) => ({ ...m, [categoria]: `Erro: ${json.error || "falha ao enviar"}` }));
      } else {
        setDocumentosState((ds) => [...ds, json.documento]);
        setMensagem((m) => ({ ...m, [categoria]: "Documento enviado com sucesso." }));
      }
    } catch (err: any) {
      setMensagem((m) => ({ ...m, [categoria]: `Erro: ${err.message}` }));
    } finally {
      setEnviando(null);
    }
  }

  // Exclui um documento do estudante enviado pelo proprio cliente. Pede
  // confirmacao e remove da lista ao concluir. A regra de seguranca tambem e
  // aplicada no servidor (so categoria "estudante" + origem "titular").
  async function excluirDocumento(doc: any) {
    const ok = window.confirm(
      `Excluir "${labelDoTipoDocumento(doc.tipo_documento)}" (${doc.nome_arquivo})? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setExcluindo(doc.id);
    setMensagem((m) => ({ ...m, estudante: "" }));
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMensagem((m) => ({ ...m, estudante: json.erro || "Não foi possível excluir o documento." }));
      } else {
        setDocumentosState((ds) => ds.filter((d) => d.id !== doc.id));
        setMensagem((m) => ({ ...m, estudante: "Documento excluído." }));
      }
    } catch {
      setMensagem((m) => ({ ...m, estudante: "Não foi possível excluir o documento." }));
    } finally {
      setExcluindo(null);
    }
  }

  // Reenvio inline de um documento rejeitado: pre-seleciona o tipo na caixa de
  // envio da mesma categoria e rola ate ela, para o cliente nao precisar caçar
  // o campo nem adivinhar o que escolher.
  function reenviarDocumento(doc: any) {
    const categoria = categoriaDoTipoDocumento(doc.tipo_documento);
    setTipoUpload((t) => ({ ...t, [categoria]: doc.tipo_documento }));
    const alvo = typeof document !== "undefined" ? document.getElementById(`upload-${categoria}`) : null;
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function linhaDocumento(doc: any) {
    const categoria = categoriaDoTipoDocumento(doc.tipo_documento);
    // Cliente pode excluir apenas documentos do ESTUDANTE que ele proprio
    // enviou (origem "titular"). Documentos da escola/financeiro ficam protegidos.
    const podeExcluir = categoria === "estudante" && doc.origem === "titular";
    // Reenvio so faz sentido para documentos do estudante (unica categoria que
    // o cliente envia) que o admin marcou como rejeitados.
    const podeReenviar = categoria === "estudante" && doc.status === "rejeitado";

    // Botao de acao com alvo de toque confortavel (>=44px de altura).
    const acaoBase: any = {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      minHeight: 44, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
      textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap",
      background: "#fff", border: "1px solid #dcdcdc",
    };

    return createElement(
      "div",
      { key: doc.id, style: { padding: "14px 0", borderTop: "1px solid #eee" } },
      // Linha 1: icone + nome/arquivo + status
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 12 } },
        IconeArquivo(),
        createElement(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#1a1a1a" } }, labelDoTipoDocumento(doc.tipo_documento)),
          createElement("div", { style: { fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, doc.nome_arquivo)
        ),
        StatusBadge(doc.status)
      ),
      // Motivo da rejeicao, quando houver: diz ao cliente O QUE corrigir.
      doc.status === "rejeitado" && doc.motivo_rejeicao
        ? createElement(
            "p",
            { style: { fontSize: 12.5, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 10px", margin: "10px 0 0", lineHeight: 1.4 } },
            createElement("span", { style: { fontWeight: 700 } }, "Motivo: "),
            doc.motivo_rejeicao
          )
        : null,
      // Linha 2: acoes com alvo de toque adequado, destrutivo separado e neutro.
      createElement(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 } },
        createElement(
          "a",
          { href: `/api/documentos/${doc.id}/download`, target: "_blank", rel: "noreferrer", style: { ...acaoBase, color: OURO_TEXTO } },
          iconeBaixar(),
          "Baixar"
        ),
        podeReenviar
          ? createElement(
              "button",
              { onClick: () => reenviarDocumento(doc), style: { ...acaoBase, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa" } },
              iconeReenviar(),
              "Reenviar"
            )
          : null,
        podeExcluir
          ? createElement(
              "button",
              { onClick: () => excluirDocumento(doc), disabled: excluindo === doc.id, style: { ...acaoBase, color: "#6b6b6b" } },
              iconeLixeira(),
              excluindo === doc.id ? "Excluindo..." : "Excluir"
            )
          : null
      )
    );
  }

  function caixaUpload(secao: any) {
    return createElement(
      "div",
      { id: `upload-${secao.valor}`, style: { marginTop: 16, padding: 14, borderRadius: 12, background: "#fafafa", border: "1px dashed #d8d8d8" } },
      createElement("div", { style: { fontSize: 13, fontWeight: 600, color: VERDE, marginBottom: 10 } }, "Enviar novo documento"),
      createElement(
        "select",
        {
          value: tipoUpload[secao.valor] || secao.tipos[0]?.valor,
          onChange: (e: any) => setTipoUpload((t) => ({ ...t, [secao.valor]: e.target.value })),
          style: { display: "block", width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" },
        },
        ...secao.tipos.map((t: any) => createElement("option", { key: t.valor, value: t.valor }, t.label))
      ),
      createElement("input", {
        type: "file",
        accept: "image/*,application/pdf",
        disabled: enviando === secao.valor,
        onChange: (e: any) => enviarArquivo(secao.valor, secao.tipos, e),
        style: { display: "block", width: "100%", fontSize: 13 },
      }),
      createElement("p", { style: { fontSize: 11.5, color: "#8a8a8a", marginTop: 6 } }, "Formatos aceitos: PDF, JPG ou PNG."),
      enviando === secao.valor ? createElement("p", { style: { fontSize: 12, color: "#666", marginTop: 8 } }, "Enviando...") : null,
      mensagem[secao.valor] ? createElement("p", { style: { fontSize: 12, marginTop: 8, color: VERDE } }, mensagem[secao.valor]) : null
    );
  }

  function cardSecao(secao: any) {
    const vazia = secao.grupos.length === 0;
    const subtitulo = secao.valor === "estudante"
      ? "Documentos que você envia para a EXP Tour"
      : secao.valor === "escola"
      ? "Documentos emitidos pela escola ou pela EXP Tour"
      : "Documentos financeiros do seu programa";
    return createElement(
      "div",
      { key: secao.valor, style: { background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" } },
      createElement("h2", { style: { fontFamily: "Bellefair, serif", fontSize: 20, color: VERDE, margin: 0 } }, secao.label),
      createElement("p", { style: { fontSize: 12, color: "#999", margin: "4px 0 4px" } }, subtitulo),
      vazia
        ? createElement(
            "p",
            { style: { fontSize: 13, color: "#6b6b6b", padding: "16px 0 4px" } },
            secao.valor === "estudante"
              ? "Você ainda não enviou documentos desta categoria. Use o campo abaixo para enviar."
              : "A EXP Tour disponibilizará seus documentos aqui assim que estiverem prontos."
          )
        : createElement("div", null, ...secao.grupos.flatMap((g: any) => g.itens.map((doc: any) => linhaDocumento(doc)))),
      podeEnviar(secao.valor) ? caixaUpload(secao) : null
    );
  }

  // Card de orientacao: passo a passo do passaporte + botao de afiliado do visto.
  function cardAjuda() {
    const botaoBase: any = {
      display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px",
      borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center",
      textDecoration: "none", cursor: "pointer", border: "none",
    };
    return createElement(
      "div",
      { style: { background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" } },
      createElement("h2", { style: { fontFamily: "Bellefair, serif", fontSize: 20, color: VERDE, margin: 0 } }, "Passaporte e visto"),
      createElement("p", { style: { fontSize: 12, color: "#999", margin: "4px 0 12px" } }, "Precisa tirar o passaporte ou solicitar o visto? A gente te orienta."),
      // Botao: como solicitar passaporte (abre/fecha o passo a passo)
      createElement(
        "button",
        { onClick: () => setMostrarPassaporte((v) => !v), style: { ...botaoBase, background: VERDE, color: CREME } },
        mostrarPassaporte ? "Ocultar passo a passo" : "Como solicitar passaporte"
      ),
      // Painel com o passo a passo
      mostrarPassaporte
        ? createElement(
            "div",
            { style: { marginTop: 12, padding: 16, borderRadius: 12, background: "#fafafa", border: "1px solid #eee" } },
            createElement(
              "ol",
              { style: { margin: 0, paddingLeft: 20, color: "#333", fontSize: 13, lineHeight: 1.6 } },
              ...PASSOS_PASSAPORTE.map((p, i) => createElement("li", { key: i, style: { marginBottom: 8 } }, p))
            ),
            createElement("p", { style: { fontSize: 12, color: "#92600a", background: "#fdf3d7", padding: "8px 10px", borderRadius: 8, margin: "12px 0 0" } }, "Menor de idade: é obrigatória a presença dos pais ou responsáveis no atendimento, com a documentação de autorização. Consulte sempre o site oficial para valores e regras atualizadas."),
            createElement(
              "a",
              { href: "https://www.gov.br/pf/pt-br/assuntos/passaporte", target: "_blank", rel: "noreferrer", style: { display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 600, color: OURO_TEXTO, textDecoration: "underline" } },
              "Abrir site oficial da Polícia Federal →"
            )
          )
        : null,
      // Botao: solicitar visto (afiliado) -- so aparece se a env existir
      afiliadoVistoUrl
        ? createElement(
            "a",
            { href: afiliadoVistoUrl, target: "_blank", rel: "noreferrer nofollow sponsored", style: { ...botaoBase, background: OURO, color: VERDE, marginTop: 10 } },
            "Solicitar visto com parceiro"
          )
        : null
    );
  }

  return createElement(
    "div",
    { className: "md:grid md:grid-cols-2 md:gap-4 md:items-start", style: { marginBottom: 32 } },
    cardAjuda(),
    ...secoes.map((secao) => cardSecao(secao))
  );
}
