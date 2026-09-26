// Infra minima de i18n do Portal do Fornecedor (bilingue pt/en). O idioma vem
// de sessao.language (coluna supplier_user.language), carregado em
// SessaoFornecedor (fornecedor-session.ts) e repassado como prop pelas paginas
// server aos componentes client. Sem framework externo: cada arquivo declara
// seu proprio par de textos { pt, en } e resolve com t(idioma, dicionario).
// Valor de idioma desconhecido cai para "en" (nao trava a tela).

export type FornecedorLang = "pt" | "en";

export function normalizarIdiomaFornecedor(idioma: string | null | undefined): FornecedorLang {
  return idioma === "pt" ? "pt" : "en";
}

// Resolve o dicionario {pt, en} para o idioma da sessao. Cada arquivo client
// declara seu proprio par de textos e chama t(idioma, TEXTOS) uma vez no topo
// do componente.
export function t<T>(idioma: string | null | undefined, dicionario: { pt: T; en: T }): T {
  return dicionario[normalizarIdiomaFornecedor(idioma)];
}

// Rotulo de status compartilhado pelos 3 editores de conteudo (curso, escola,
// acomodacao) e pelas respectivas listas — mesmo STATUS_LABEL hoje duplicado
// em ConteudoProgramaEditor/ConteudoEscolaEditor/ConteudoAcomodacaoEditor e nas
// paginas de lista de conteudo/escolas/acomodacoes.
type StatusConteudo = "draft" | "pending_admin" | "approved" | "rejected";

const CORES_STATUS_CONTEUDO: Record<StatusConteudo, string> = {
  draft: "var(--p-accent-ink)",
  pending_admin: "#1d4ed8",
  approved: "var(--p-success-ink)",
  rejected: "#b91c1c",
};

export function statusConteudoLabel(idioma: string | null | undefined, status: string): { texto: string; cor: string } {
  const textos = t(idioma, {
    pt: { draft: "Rascunho", pending_admin: "Aguardando EXP Tour", approved: "Publicado", rejected: "Devolvido" },
    en: { draft: "Draft", pending_admin: "Awaiting EXP Tour", approved: "Published", rejected: "Returned" },
  }) as Record<string, string>;
  const cor = CORES_STATUS_CONTEUDO[status as StatusConteudo] || "var(--p-muted)";
  const texto = textos[status] || status;
  return { texto, cor };
}

// Rotulos das abas de idioma do CONTEUDO (pt-BR/en/es) nos 3 editores — nao
// confundir com o idioma da UI do portal em si.
export function localeConteudoLabel(idioma: string | null | undefined): Record<string, string> {
  return t(idioma, {
    pt: { "pt-BR": "Português", en: "English", es: "Español" },
    en: { "pt-BR": "Portuguese (BR)", en: "English", es: "Spanish" },
  });
}

// Textos comuns aos 3 editores de conteudo (botoes, mensagens de erro/sucesso,
// avisos de estado nao-editavel). Extrai a duplicacao literal hoje presente em
// ConteudoProgramaEditor / ConteudoEscolaEditor / ConteudoAcomodacaoEditor.
export function textosEditorConteudo(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      statusRotulo: "Status:",
      carregando: "Carregando…",
      salvarRascunho: "Salvar rascunho",
      salvando: "Salvando…",
      enviarParaExpTour: "Enviar para a EXP Tour",
      confirmarEnvio: "Enviar este conteúdo para a EXP Tour aprovar? Você não poderá editar enquanto estiver em análise.",
      devolvidoPelaExpTour: "Devolvido pela EXP Tour:",
      avisoPendingAdmin: "Este conteúdo está em análise pela EXP Tour.",
      avisoApproved: "Este conteúdo já está publicado. Para alterá-lo, fale com a EXP Tour.",
      avisoNaoEditavel: "Este conteúdo não está editável.",
      erroAbrirConteudo: "Não foi possível abrir o conteúdo.",
      erroSalvar: "Não foi possível salvar.",
      erroEnviar: "Não foi possível enviar.",
      falhaConexao: "Falha de conexão.",
      rascunhoSalvo: "Rascunho salvo.",
      enviadoParaExpTour: "Enviado para a EXP Tour.",
      traducaoAutomatica: "Tradução automática (revisar)",
      remover: "Remover",
      nenhumaMidia: "Nenhuma mídia. Referencie por URL (a ordem segue a lista).",
      adicionarMidia: "+ Adicionar mídia",
      legenda: "legenda",
      imagem: "imagem",
      video: "vídeo",
      documento: "documento",
    },
    en: {
      statusRotulo: "Status:",
      carregando: "Loading…",
      salvarRascunho: "Save draft",
      salvando: "Saving…",
      enviarParaExpTour: "Submit to EXP Tour",
      confirmarEnvio: "Submit this content for EXP Tour to approve? You won't be able to edit it while it's under review.",
      devolvidoPelaExpTour: "Returned by EXP Tour:",
      avisoPendingAdmin: "This content is under review by EXP Tour.",
      avisoApproved: "This content is already published. Contact EXP Tour to change it.",
      avisoNaoEditavel: "This content is not editable.",
      erroAbrirConteudo: "Could not open the content.",
      erroSalvar: "Could not save.",
      erroEnviar: "Could not submit.",
      falhaConexao: "Connection failed.",
      rascunhoSalvo: "Draft saved.",
      enviadoParaExpTour: "Submitted to EXP Tour.",
      traducaoAutomatica: "Machine translated (review needed)",
      remover: "Remove",
      nenhumaMidia: "No media yet. Reference it by URL (order follows the list).",
      adicionarMidia: "+ Add media",
      legenda: "caption",
      imagem: "image",
      video: "video",
      documento: "document",
    },
  });
}

// Textos da tela "Marca" (favicon + redes sociais do fornecedor) — sem fluxo
// de aprovação: é metadado de contato/branding, não conteúdo comercial, e
// social/favicon são colunas do FORNECEDOR (compartilhadas por todos os
// campi), por isso a tela é única, fora do padrão rascunho→aprovação dos 3
// editores de conteúdo.
export function textosMarcaFornecedor(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Marca",
      subtitulo: "Aparecem na proposta do estudante: o ícone do site ao lado do nome da escola e as redes como ícones clicáveis. Deixe em branco o que sua escola não tiver.",
      icone: "Ícone do site (favicon)",
      salvar: "Salvar",
      salvando: "Salvando…",
      salvo: "Salvo ✓",
      erroGenerico: "Erro de rede.",
      avisoValidacao: "O endereço precisa ser do próprio site da rede — um link do Instagram no campo do Facebook é recusado, para o ícone não levar o estudante a outro lugar.",
      carregando: "Carregando…",
      erroCarregar: "Não foi possível carregar os dados de marca.",
    },
    en: {
      titulo: "Brand",
      subtitulo: "These appear in the student's proposal: the site icon next to the school name and the social links as clickable icons. Leave blank whatever your school doesn't have.",
      icone: "Site icon (favicon)",
      salvar: "Save",
      salvando: "Saving…",
      salvo: "Saved ✓",
      erroGenerico: "Network error.",
      avisoValidacao: "The address needs to be from the network's own site — an Instagram link in the Facebook field is rejected, so the icon doesn't send the student somewhere else.",
      carregando: "Loading…",
      erroCarregar: "Could not load the brand data.",
    },
  });
}

// Nomes das redes sociais, no idioma do portal (REDE_LABEL de redes-sociais.ts
// é fixo em português — usado na proposta pública do estudante, não aqui).
export function redeLabelFornecedor(idioma: string | null | undefined): Record<string, string> {
  return t(idioma, {
    pt: { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok", x: "X (Twitter)" },
    en: { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok", x: "X (Twitter)" },
  });
}
