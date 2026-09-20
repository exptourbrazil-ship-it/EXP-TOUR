// Conversão de TEXTO PURO digitado pelo consultor em HTML mínimo (<p>/<br>).
//
// Por que existe: o caminho antigo escapava no cliente (`textoParaHtml`),
// sanitizava no servidor e sanitizava DE NOVO na leitura. Como `sanitizarHtml`
// não é idempotente — ele escapa `&` a cada passagem —, "Taxa & seguro" chegava
// ao estudante como "Taxa &amp; seguro". Com esta função o escape acontece UMA
// vez, no servidor, a partir do texto cru.
//
// NB: módulo PURO — sem dependência de rede/DB. Testado em texto-html.test.ts.

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Texto puro -> HTML. Linha em branco separa parágrafo; quebra simples vira
 * `<br>`. Devolve "" quando não sobra conteúdo.
 */
export function textoParaHtmlSimples(texto: string): string {
  const limpo = (texto ?? "").replace(/\r\n/g, "\n").trim();
  if (!limpo) return "";
  return limpo
    .split(/\n{2,}/)
    .map((par) => par.trim())
    .filter((par) => par !== "")
    .map((par) => `<p>${escapar(par).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Tamanho do texto VISÍVEL de um HTML simples, para medir limite do mesmo jeito
 * no cliente (que conta o textarea) e no servidor (que recebe o HTML). Contar o
 * HTML cru rejeitaria uma nota que a tela disse que ainda cabia.
 */
export function tamanhoVisivel(html: string): number {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim().length;
}
