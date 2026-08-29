// Estrutura de navegacao do painel admin, em um unico lugar (dados puros, sem
// JSX) para o layout (menu lateral) e a home (cards de secao) ficarem sempre
// em sincronia. Os itens marcados com `emBreve` desenham a estrutura planejada
// do dashboard (Financeiro, Clientes, Sistema) sem prometer telas que ainda
// nao existem — viram links de verdade conforme cada fase e entregue.

import type { CapacidadeAdmin } from "@/lib/admin-roles";

export type AdminNavItem = {
  href: string;
  label: string;
  descricao: string;
  // `d` de um <path> SVG (traco de 24x24). Renderizado pelo menu/cards.
  icone: string;
  // Quando true, aparece esmaecido e sem link (fase futura do dashboard).
  emBreve?: boolean;
  // Capacidade exigida para VER o item no menu. Espelha o guard da pagina
  // (exigirCapacidade): so definimos onde a pagina ja e gateada por capacidade,
  // para o menu nao esconder algo que o papel de fato consegue abrir. Itens sem
  // capacidade (ainda so exigirAdmin) permanecem visiveis a qualquer admin.
  capacidade?: CapacidadeAdmin;
};

// Icones (Heroicons outline, traco unico) como caminho SVG.
const ICONES = {
  inicio:
    "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10",
  financeiro:
    "M12 3v18M8 7h6a3 3 0 0 1 0 6H8m0 0h8",
  documentos:
    "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6",
  clientes:
    "M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  sistema:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.2l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  cambio:
    "M4 8h13l-3-3M20 16H7l3 3",
  data:
    "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  viagem:
    "M10 4h4l1 5 5 2v2l-5-.5-2 4 2 1.5V21l-3-1-3 1v-2l2-1.5-2-4L4 15v-2l5-2 1-5z",
  contratos:
    "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6M9 14l2 2 4-4",
  termos:
    "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6M9 12h6M9 16h6",
  antecipacoes:
    "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  propostas:
    "M7 3h10a1 1 0 0 1 1 1v16l-6-3-6 3V4a1 1 0 0 1 1-1zM9 8h6M9 12h6",
  cotacoes:
    "M9 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9M9 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M9 3v18M12 8h4M12 12h4",
  anexo:
    "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v6h6M9 13h6M9 17h4",
  forcaMaior:
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  fornecedores:
    "M3 21V8l6-4 6 4v13M9 21v-5h4v5M13 8h5a1 1 0 0 1 1 1v12M17 12h.01M17 16h.01",
} as const;

// Itens ja disponiveis (telas que existem hoje) + estrutura futura (emBreve).
export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Início",
    descricao: "Visão geral do painel",
    icone: ICONES.inicio,
  },
  {
    href: "/admin/financeiro",
    label: "Financeiro",
    descricao: "Recebido, a receber e parcelas em atraso",
    icone: ICONES.financeiro,
    capacidade: "financeiro.ver",
  },
  {
    href: "/admin/contas-a-pagar",
    label: "Contas a pagar",
    descricao: "Repasses às escolas (D-30) e comprovantes",
    icone: ICONES.financeiro,
    capacidade: "financeiro.ver",
  },
  {
    href: "/admin/documentos",
    label: "Documentos",
    descricao: "Aprovar, rejeitar e enviar documentos",
    icone: ICONES.documentos,
    capacidade: "documentos.analisar",
  },
  {
    href: "/admin/propostas",
    label: "Propostas",
    descricao: "Criar e acompanhar propostas (checkout)",
    icone: ICONES.propostas,
  },
  {
    href: "/admin/quotes",
    label: "Cotações",
    descricao: "Montar cotações com opções comparáveis",
    icone: ICONES.cotacoes,
    capacidade: "propostas.gerir",
  },
  {
    href: "/admin/clientes",
    label: "Clientes",
    descricao: "Carteira de titulares e contratos",
    icone: ICONES.clientes,
    capacidade: "casos.ver",
  },
  {
    href: "/admin/contratos",
    label: "Contratos",
    descricao: "Enviar contrato para assinatura (Zoho Sign)",
    icone: ICONES.contratos,
  },
  {
    href: "/admin/fornecedores",
    label: "Fornecedores",
    descricao: "Sincronizar escolas do Zoho e acessos do portal",
    icone: ICONES.fornecedores,
    capacidade: "fornecedores.gerir",
  },
  {
    href: "/admin/precos",
    label: "Preços",
    descricao: "Aprovar e publicar price lists das escolas",
    icone: ICONES.cotacoes,
    capacidade: "fornecedores.gerir",
  },
  {
    href: "/admin/materiais",
    label: "Materiais",
    descricao: "Biblioteca de materiais das escolas (proposta)",
    icone: ICONES.documentos,
    capacidade: "casos.ver",
  },
  {
    href: "/admin/disponibilidade",
    label: "Disponibilidade",
    descricao: "Programas e datas de início por fornecedor",
    icone: ICONES.data,
    capacidade: "fornecedores.gerir",
  },
  {
    href: "/admin/antecipacoes",
    label: "Antecipações",
    descricao: "Antecipações exigidas por visto/fornecedor",
    icone: ICONES.antecipacoes,
    capacidade: "financeiro.ver",
  },
  {
    href: "/admin/anexo-iii",
    label: "Anexo III",
    descricao: "Política de pagamento dos fornecedores",
    icone: ICONES.anexo,
  },
  {
    href: "/admin/termos",
    label: "Termos",
    descricao: "Versões do Termo de Adesão",
    icone: ICONES.termos,
  },
  {
    href: "/admin/sistema",
    label: "Sistema",
    descricao: "Webhooks, régua de cobrança e NPS",
    icone: ICONES.sistema,
  },
  {
    href: "/admin/cambio",
    label: "Câmbio",
    descricao: "Informar cotação comercial manual",
    icone: ICONES.cambio,
  },
  {
    href: "/admin/forca-maior",
    label: "Força maior",
    descricao: "Pausa e comunicação em lote por destino (só Gestor)",
    icone: ICONES.forcaMaior,
    capacidade: "config.gerir",
  },
  {
    href: "/admin/data-inicio",
    label: "Data de início",
    descricao: "Definir início do curso do titular",
    icone: ICONES.data,
  },
  {
    href: "/admin/viagem",
    label: "Viagem",
    descricao: "Escola, acomodação e contato local",
    icone: ICONES.viagem,
  },
];
