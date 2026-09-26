// Navegação do Portal do Parceiro (fornecedor), data-driven — espelha o padrão
// do admin (admin-nav.ts), mas com os ícones em SVG path (`d`) para caber no
// header claro/verde do tenant sem depender de Tailwind (o portal usa estilos
// inline + tokens --p-*). Cada item também declara o GRUPO estilo Edvisor
// (Inventário / Alunos / Financeiro); numa barra horizontal os grupos não viram
// cabeçalho, mas ordenam os itens e alimentam os atalhos do Painel.

export type GrupoFornecedor = "Alunos" | "Inventário" | "Financeiro";

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
} as const;

// Ordem de exibição: Painel (Alunos, topo) → Estudantes → Inventário → Financeiro.
export const FORNECEDOR_NAV: FornecedorNavItem[] = [
  { href: "/fornecedor", label: "Painel", labelEn: "Dashboard", grupo: "Alunos", icone: IC.painel },
  { href: "/fornecedor/estudantes", label: "Estudantes", labelEn: "Students", grupo: "Alunos", icone: IC.estudantes, descricao: "Seus estudantes vinculados e o status de cada um.", descricaoEn: "Your enrolled students and each one's status." },
  { href: "/fornecedor/disponibilidade", label: "Disponibilidade", labelEn: "Availability", grupo: "Inventário", icone: IC.disponibilidade, descricao: "Datas de início e capacidade dos seus programas.", descricaoEn: "Start dates and capacity for your programs." },
  { href: "/fornecedor/precos", label: "Preços", labelEn: "Pricing", grupo: "Inventário", icone: IC.precos, descricao: "Envie e revise suas tabelas de preço.", descricaoEn: "Submit and review your price lists." },
  { href: "/fornecedor/conteudo", label: "Conteúdo", labelEn: "Content", grupo: "Inventário", icone: IC.conteudo, descricao: "Descreva seus cursos (o que o estudante vê na cotação).", descricaoEn: "Describe your courses (what students see in the quote)." },
  { href: "/fornecedor/escolas", label: "Escolas", labelEn: "Schools", grupo: "Inventário", icone: IC.escola, descricao: "Sobre a escola, fotos, estrutura e acreditações.", descricaoEn: "About the school, photos, facilities and accreditations." },
  { href: "/fornecedor/acomodacoes", label: "Acomodações", labelEn: "Accommodation", grupo: "Inventário", icone: IC.acomodacao, descricao: "Descrição, políticas e ficha das acomodações.", descricaoEn: "Description, policies and details of the accommodation." },
  { href: "/fornecedor/marca", label: "Marca", labelEn: "Brand", grupo: "Inventário", icone: IC.marca, descricao: "Ícone do site e redes sociais, usados na proposta do estudante.", descricaoEn: "Site icon and social links, used in the student's proposal." },
  { href: "/fornecedor/materiais", label: "Materiais", labelEn: "Materials", grupo: "Inventário", icone: IC.materiais, descricao: "Documentos e materiais para os estudantes.", descricaoEn: "Documents and materials for students." },
  { href: "/fornecedor/financeiro", label: "Financeiro", labelEn: "Finance", grupo: "Financeiro", icone: IC.financeiro, descricao: "Seu extrato de repasses e comprovantes.", descricaoEn: "Your payout statement and receipts." },
];

// Itens do grupo "Inventário", na ordem de FORNECEDOR_NAV — usados no Painel
// para montar os atalhos de inventário (estilo Edvisor: Inventory Home).
export const ITENS_INVENTARIO_FORNECEDOR = FORNECEDOR_NAV.filter((i) => i.grupo === "Inventário");
