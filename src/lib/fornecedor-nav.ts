// Navegação do Portal do Parceiro (fornecedor), data-driven — espelha o padrão
// do admin (admin-nav.ts), mas com os ícones em SVG path (`d`) para caber no
// header claro/verde do tenant sem depender de Tailwind (o portal usa estilos
// inline + tokens --p-*). Cada item também declara o GRUPO estilo Edvisor
// (Alunos / Inventário / Institucional / Financeiro); numa barra horizontal os
// grupos não viram cabeçalho, mas ordenam os itens e alimentam os atalhos do
// Painel (uma seção por grupo — ver ITENS_INVENTARIO_FORNECEDOR/
// ITENS_INSTITUCIONAL_FORNECEDOR).
//
// Por que "Institucional" é um grupo à parte de "Inventário": Sobre a
// instituição e Materiais são dados do FORNECEDOR como um todo (quem ele é —
// ícone, logo, redes, apresentação, contato, biblioteca de materiais), sem
// fluxo de rascunho/aprovação; "Inventário" é o que ele VENDE por
// campus/curso (disponibilidade, preço, conteúdo do curso/campus/
// acomodação), sempre via rascunho → aprovação da EXP Tour. Misturar os dois
// grupos era uma das causas do menu "pouco intuitivo": a escola via "Marca"
// ao lado de "Preços" sem pista do porquê. "Marca" e "Sobre a instituição"
// eram duas telas separadas para os mesmos dados do fornecedor; unificadas
// numa só (/fornecedor/instituicao, ver instituicao/page.tsx) — por isso não
// há mais um item de nav "Marca" aqui (a rota /fornecedor/marca só
// redireciona para lá).
export type GrupoFornecedor = "Alunos" | "Inventário" | "Institucional" | "Financeiro";

export type FornecedorNavItem = {
  href: string;
  label: string;
  labelEn: string;
  grupo: GrupoFornecedor;
  icone: string; // path SVG (viewBox 0 0 24 24), stroke currentColor
  // Descrição curta usada nos cartões de atalho do Painel (inventory home).
  descricao?: string;
  descricaoEn?: string;
};

// Resolve label/descricao no idioma da sessao (sessao.language). Mantido aqui
// (nao em fornecedor-i18n.ts) porque e especifico da forma data-driven do nav.
export function textoNavFornecedor(item: FornecedorNavItem, idioma: string | null | undefined) {
  const en = idioma !== "pt";
  return {
    label: en ? item.labelEn : item.label,
    descricao: en ? item.descricaoEn : item.descricao,
  };
}

// Ícones (stroke, viewBox 24) coerentes com o conjunto do admin.
const IC = {
  painel: "M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 13h6v6h-6z",
  estudantes: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75",
  disponibilidade: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  precos: "M9 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9M9 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M9 3v18M12 8h4M12 12h4",
  materiais: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  conteudo: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2zM9 7h7M9 11h7",
  escola: "M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18",
  acomodacao: "M3 21h18M4 21V7l8-4 8 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4",
  financeiro: "M12 3v18M8 7h6a3 3 0 0 1 0 6H8m0 0h8",
  marca: "M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
  instituicao: "M3 21h18M6 21V10l6-4 6 4v11M10 21v-5h4v5",
} as const;

// Ordem de exibição: Painel (Alunos, topo) → Estudantes → Inventário →
// Institucional → Financeiro.
export const FORNECEDOR_NAV: FornecedorNavItem[] = [
  { href: "/fornecedor", label: "Painel", labelEn: "Dashboard", grupo: "Alunos", icone: IC.painel },
  { href: "/fornecedor/estudantes", label: "Estudantes", labelEn: "Students", grupo: "Alunos", icone: IC.estudantes, descricao: "Seus estudantes vinculados e o status de cada um.", descricaoEn: "Your enrolled students and each one's status." },
  { href: "/fornecedor/disponibilidade", label: "Disponibilidade", labelEn: "Availability", grupo: "Inventário", icone: IC.disponibilidade, descricao: "Datas de início e capacidade dos seus programas.", descricaoEn: "Start dates and capacity for your programs." },
  { href: "/fornecedor/precos", label: "Preços", labelEn: "Pricing", grupo: "Inventário", icone: IC.precos, descricao: "Envie seu price list e proponha promoções (descontos, semanas grátis, isenção de taxa).", descricaoEn: "Submit your price list and propose promotions (discounts, free weeks, fee waivers)." },
  { href: "/fornecedor/conteudo", label: "Cursos", labelEn: "Courses", grupo: "Inventário", icone: IC.conteudo, descricao: "Cadastre e descreva seus cursos (o que o estudante vê na cotação).", descricaoEn: "Register and describe your courses (what students see in the quote)." },
  { href: "/fornecedor/escolas", label: "Campus", labelEn: "Campus", grupo: "Inventário", icone: IC.escola, descricao: "Sobre o campus, fotos, estrutura e acreditações.", descricaoEn: "About the campus, photos, facilities and accreditations." },
  { href: "/fornecedor/acomodacoes", label: "Acomodações", labelEn: "Accommodation", grupo: "Inventário", icone: IC.acomodacao, descricao: "Descrição, políticas e ficha das acomodações.", descricaoEn: "Description, policies and details of the accommodation." },
  { href: "/fornecedor/instituicao", label: "Sobre a instituição", labelEn: "About the institution", grupo: "Institucional", icone: IC.instituicao, descricao: "Ícone do site, logo e redes sociais, além de apresentação, contato principal e endereço da matriz.", descricaoEn: "Site icon, logo and social links, plus presentation text, main contact and head-office address." },
  { href: "/fornecedor/materiais", label: "Materiais", labelEn: "Materials", grupo: "Institucional", icone: IC.materiais, descricao: "Biblioteca de brochuras, fotos, vídeos e mídia kit para os estudantes.", descricaoEn: "Library of brochures, photos, videos and media kit for students." },
  { href: "/fornecedor/financeiro", label: "Financeiro", labelEn: "Finance", grupo: "Financeiro", icone: IC.financeiro, descricao: "Extrato de repasses, comprovantes e seus dados bancários.", descricaoEn: "Payout statement, proofs of payment and your bank details." },
];

// Itens do grupo "Inventário", na ordem de FORNECEDOR_NAV — usados no Painel
// para montar os atalhos de inventário (estilo Edvisor: Inventory Home).
export const ITENS_INVENTARIO_FORNECEDOR = FORNECEDOR_NAV.filter((i) => i.grupo === "Inventário");

// Itens do grupo "Institucional" (Marca / Sobre a instituição / Materiais) —
// dados do fornecedor como um todo, sem fluxo de aprovação. Seção própria no
// Painel, separada do inventário à venda (ver comentário do GrupoFornecedor).
export const ITENS_INSTITUCIONAL_FORNECEDOR = FORNECEDOR_NAV.filter((i) => i.grupo === "Institucional");
