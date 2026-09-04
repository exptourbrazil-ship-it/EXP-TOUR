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
  grupo: GrupoFornecedor;
  icone: string; // path SVG (viewBox 0 0 24 24), stroke currentColor
  // Descrição curta usada nos cartões de atalho do Painel (inventory home).
  descricao?: string;
};

// Ícones (stroke, viewBox 24) coerentes com o conjunto do admin.
const IC = {
  painel: "M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 13h6v6h-6z",
  estudantes: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75",
  disponibilidade: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  precos: "M9 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9M9 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M9 3v18M12 8h4M12 12h4",
  materiais: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  financeiro: "M12 3v18M8 7h6a3 3 0 0 1 0 6H8m0 0h8",
} as const;

// Ordem de exibição: Painel (Alunos, topo) → Estudantes → Inventário → Financeiro.
export const FORNECEDOR_NAV: FornecedorNavItem[] = [
  { href: "/fornecedor", label: "Painel", grupo: "Alunos", icone: IC.painel },
  { href: "/fornecedor/estudantes", label: "Estudantes", grupo: "Alunos", icone: IC.estudantes, descricao: "Seus estudantes vinculados e o status de cada um." },
  { href: "/fornecedor/disponibilidade", label: "Disponibilidade", grupo: "Inventário", icone: IC.disponibilidade, descricao: "Datas de início e capacidade dos seus programas." },
  { href: "/fornecedor/precos", label: "Preços", grupo: "Inventário", icone: IC.precos, descricao: "Envie e revise suas tabelas de preço." },
  { href: "/fornecedor/materiais", label: "Materiais", grupo: "Inventário", icone: IC.materiais, descricao: "Documentos e materiais para os estudantes." },
  { href: "/fornecedor/financeiro", label: "Financeiro", grupo: "Financeiro", icone: IC.financeiro, descricao: "Seu extrato de repasses e comprovantes." },
];

// Itens do grupo "Inventário", na ordem de FORNECEDOR_NAV — usados no Painel
// para montar os atalhos de inventário (estilo Edvisor: Inventory Home).
export const ITENS_INVENTARIO_FORNECEDOR = FORNECEDOR_NAV.filter((i) => i.grupo === "Inventário");
