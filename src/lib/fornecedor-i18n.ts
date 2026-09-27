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

// Textos da seção "Ícone, logo e redes sociais" (favicon + logo + redes do
// fornecedor) — sem fluxo de aprovação: é metadado de contato/branding, não
// conteúdo comercial, e social/favicon/logo são colunas do FORNECEDOR
// (compartilhadas por todos os campi). Junto com textosInstituicaoFornecedor
// forma a tela única "Sobre a instituição" (/fornecedor/instituicao) — antes
// duas telas separadas ("Marca" e "Sobre a instituição"), unificadas porque
// eram, na prática, os mesmos dados do fornecedor como um todo.
export function textosMarcaFornecedor(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Ícone, logo e redes sociais",
      subtitulo: "O ícone do site aparece ao lado do nome da escola na proposta do estudante; a logo aparece no cabeçalho deste portal; as redes aparecem como ícones clicáveis na proposta. Deixe em branco o que sua escola não tiver.",
      icone: "Ícone do site (favicon)",
      logo: "Logo da instituição",
      logoPlaceholder: "https://www.suaescola.com/logo.png",
      salvar: "Salvar",
      salvando: "Salvando…",
      salvo: "Salvo ✓",
      erroGenerico: "Erro de rede.",
      avisoValidacao: "O endereço precisa ser do próprio site da rede — um link do Instagram no campo do Facebook é recusado, para o ícone não levar o estudante a outro lugar.",
      carregando: "Carregando…",
      erroCarregar: "Não foi possível carregar os dados de marca.",
    },
    en: {
      titulo: "Icon, logo and social links",
      subtitulo: "The site icon appears next to the campus name in the student's proposal; the logo appears in this portal's header; the social links appear as clickable icons in the proposal. Leave blank whatever your campus doesn't have.",
      icone: "Site icon (favicon)",
      logo: "Institution logo",
      logoPlaceholder: "https://www.yourschool.com/logo.png",
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

// Textos da seção "Apresentação e contato" (about + contato principal +
// endereço da matriz do fornecedor) — mesmo padrão de decisão da seção
// "Ícone, logo e redes sociais": sem fluxo de aprovação, gravação direta.
// Nível SUPPLIER (não campus): um só registro por escola, diferente da tela
// "Campus". Junto com textosMarcaFornecedor forma a tela única
// "Sobre a instituição" (/fornecedor/instituicao).
export function textosInstituicaoFornecedor(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Apresentação e contato",
      subtitulo: "Apresentação e contato principal da sua instituição como um todo — diferente da tela \"Campus\" (que é por unidade).",
      about: "Descrição institucional",
      aboutPlaceholder: "Um resumo da sua instituição: história, diferenciais, missão.",
      contato: "Contato principal",
      contactName: "Nome do contato",
      contactEmail: "E-mail do contato",
      contactPhone: "Telefone do contato",
      endereco: "Endereço da matriz",
      hqAddress: "Endereço",
      hqCity: "Cidade",
      hqCountryCode: "País (código de 2 letras)",
      salvar: "Salvar",
      salvando: "Salvando…",
      salvo: "Salvo ✓",
      erroGenerico: "Erro de rede.",
      carregando: "Carregando…",
      erroCarregar: "Não foi possível carregar os dados da instituição.",
    },
    en: {
      titulo: "Presentation and contact",
      subtitulo: "Presentation and main contact for your institution as a whole — different from the \"Campus\" screen (which is per unit).",
      about: "Institutional description",
      aboutPlaceholder: "A summary of your institution: history, differentiators, mission.",
      contato: "Main contact",
      contactName: "Contact name",
      contactEmail: "Contact email",
      contactPhone: "Contact phone",
      endereco: "Head office address",
      hqAddress: "Address",
      hqCity: "City",
      hqCountryCode: "Country (2-letter code)",
      salvar: "Save",
      salvando: "Saving…",
      salvo: "Saved ✓",
      erroGenerico: "Network error.",
      carregando: "Loading…",
      erroCarregar: "Could not load the institution data.",
    },
  });
}

// Textos do bloco "Localizacao e contato" do editor de conteudo de escola
// (ConteudoEscolaEditor) — campus.address/postal_code/city/region/phone/
// email/website. Mesmo padrao de decisao da tela "Marca": metadado
// operacional, sem fluxo de aprovacao, gravacao DIRETA e separada do
// salvar/enviar do rascunho de conteudo.
export function textosLocalizacaoContatoCampus(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Localização e contato",
      subtitulo: "Endereço e contato da escola — usados internamente e, quando preenchidos, na proposta do estudante. Diferente do conteúdo acima, isto é salvo direto, sem precisar de aprovação da EXP Tour.",
      endereco: "Endereço",
      cep: "CEP / Postal code",
      cidade: "Cidade",
      regiao: "Região / Estado / Província",
      telefone: "Telefone",
      email: "E-mail",
      site: "Site",
      salvar: "Salvar",
      salvando: "Salvando…",
      salvo: "Salvo ✓",
      erroGenerico: "Não foi possível salvar.",
      falhaConexao: "Falha de conexão.",
    },
    en: {
      titulo: "Location and contact",
      subtitulo: "The campus's address and contact details — used internally and, when filled in, on the student's proposal. Unlike the content above, this is saved right away, with no EXP Tour approval needed.",
      endereco: "Address",
      cep: "Postal code",
      cidade: "City",
      regiao: "Region / State / Province",
      telefone: "Phone",
      email: "Email",
      site: "Website",
      salvar: "Save",
      salvando: "Saving…",
      salvo: "Saved ✓",
      erroGenerico: "Could not save.",
      falhaConexao: "Connection failed.",
    },
  });
}

// Textos da seção "Dados bancários" (aba Financeiro) — proposta do fornecedor
// para o destino do repasse. Deixa MUITO explícito que a mudança só vale depois
// que a EXP Tour confirmar (nunca ambíguo: dinheiro errado é prejuízo real).
export function textosContaBancariaFornecedor(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Dados bancários",
      subtitulo:
        "A conta para onde a EXP Tour envia o repasse. Uma alteração aqui é só uma PROPOSTA — ela só passa a valer depois que a EXP Tour confirmar manualmente. Enquanto isso, o repasse continua indo para a conta confirmada anteriormente (se houver).",
      statusPendente: "Pendente de confirmação",
      statusConfirmada: "Confirmada",
      statusRejeitada: "Rejeitada",
      statusSuperada: "Substituída",
      avisoPendente: "Esta proposta ainda não foi confirmada pela EXP Tour. Você pode editá-la ou cancelá-la enquanto estiver pendente.",
      avisoConfirmada: "Esta é a conta em uso hoje para o repasse. Para trocar, envie uma nova proposta abaixo — ela só vale após confirmação.",
      motivoRejeicao: "Motivo:",
      contaConfirmadaAtual: "Conta confirmada atualmente",
      propostaPendente: "Proposta enviada (aguardando confirmação)",
      propor: "Propor alteração",
      editarProposta: "Editar proposta",
      cancelarEdicao: "Cancelar",
      titular: "Nome do titular da conta",
      banco: "Banco",
      pais: "País (código, ex.: BR, US)",
      moeda: "Moeda (código, ex.: BRL, USD)",
      iban: "IBAN",
      swift: "SWIFT/BIC",
      conta: "Número da conta",
      routing: "Agência / routing number",
      pix: "Chave Pix",
      observacoes: "Observações (opcional)",
      observacoesPlaceholder: "Ex.: conta em nome da matriz, não da filial…",
      enviar: "Enviar proposta",
      enviando: "Enviando…",
      salvarAlteracoes: "Salvar alterações",
      identificadorAjuda: "Preencha ao menos um: IBAN, ou conta + agência/routing, ou chave Pix.",
      erroGenerico: "Não foi possível enviar. Confira os campos destacados.",
      falhaConexao: "Falha de conexão.",
      sucessoEnviada: "Proposta enviada — aguarde a confirmação da EXP Tour.",
      semDados: "Nenhum dado bancário cadastrado ainda.",
      carregando: "Carregando…",
    },
    en: {
      titulo: "Bank details",
      subtitulo:
        "The account EXP Tour sends the payout to. A change here is only a PROPOSAL — it only takes effect once EXP Tour manually confirms it. Until then, the payout keeps going to the previously confirmed account (if any).",
      statusPendente: "Awaiting confirmation",
      statusConfirmada: "Confirmed",
      statusRejeitada: "Rejected",
      statusSuperada: "Replaced",
      avisoPendente: "This proposal has not been confirmed by EXP Tour yet. You can edit or cancel it while it's pending.",
      avisoConfirmada: "This is the account currently used for the payout. To change it, submit a new proposal below — it only applies once confirmed.",
      motivoRejeicao: "Reason:",
      contaConfirmadaAtual: "Currently confirmed account",
      propostaPendente: "Proposal submitted (awaiting confirmation)",
      propor: "Propose a change",
      editarProposta: "Edit proposal",
      cancelarEdicao: "Cancel",
      titular: "Account holder name",
      banco: "Bank",
      pais: "Country (code, e.g.: BR, US)",
      moeda: "Currency (code, e.g.: BRL, USD)",
      iban: "IBAN",
      swift: "SWIFT/BIC",
      conta: "Account number",
      routing: "Routing number / branch",
      pix: "Pix key",
      observacoes: "Notes (optional)",
      observacoesPlaceholder: "E.g.: account under the parent company's name, not the branch…",
      enviar: "Submit proposal",
      enviando: "Submitting…",
      salvarAlteracoes: "Save changes",
      identificadorAjuda: "Fill in at least one: IBAN, or account + routing number, or Pix key.",
      erroGenerico: "Could not submit. Check the highlighted fields.",
      falhaConexao: "Connection failed.",
      sucessoEnviada: "Proposal submitted — waiting for EXP Tour to confirm.",
      semDados: "No bank details on file yet.",
      carregando: "Loading…",
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
