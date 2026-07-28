// Checklist de pre-embarque (aba Embarque). Estrutura pura e testavel: a lista
// e montada por destino (pais) juntando a lista-base a itens especificos.
// Itens de tipo "documento" marcam sozinhos quando o documento existe no cofre;
// itens de tipo "tarefa" o aluno marca manualmente (estado em embarque_checklist).

export type TipoItem = "documento" | "tarefa";

export type ItemChecklist = {
  chave: string; // id estavel do item (usado para salvar o estado das tarefas)
  label: string;
  tipo: TipoItem;
  // Para tipo "documento": marca como concluido se ALGUM destes tipos de
  // documento estiver presente no cofre do titular.
  tiposDocumento?: string[];
  // Dica opcional exibida quando o item ainda nao esta concluido.
  dica?: string;
};

// Lista comum a todos os destinos.
export const CHECKLIST_BASE: ItemChecklist[] = [
  { chave: "passaporte", label: "Passaporte válido", tipo: "documento", tiposDocumento: ["passaporte"], dica: "Envie a foto do passaporte na aba Documentos." },
  { chave: "carta_aceite", label: "Carta de aceite (LOA)", tipo: "documento", tiposDocumento: ["carta_aceite"] },
  { chave: "passagem_aerea", label: "Passagem aérea", tipo: "documento", tiposDocumento: ["passagem_aerea"] },
  { chave: "seguro_saude", label: "Seguro saúde", tipo: "documento", tiposDocumento: ["seguro_saude"] },
  { chave: "acomodacao", label: "Comprovante de acomodação", tipo: "documento", tiposDocumento: ["carta_acomodacao"] },
  { chave: "contatos_emergencia", label: "Contatos de emergência salvos no celular", tipo: "tarefa" },
  { chave: "malas", label: "Malas prontas (peso e dimensões da cia aérea)", tipo: "tarefa" },
  { chave: "cartao_internacional", label: "Cartão internacional habilitado / banco avisado", tipo: "tarefa" },
  { chave: "chip_roaming", label: "Chip internacional ou roaming ativado", tipo: "tarefa" },
  { chave: "copias_digitais", label: "Cópias digitais dos documentos na nuvem", tipo: "tarefa" },
];

// Itens adicionais por destino. A chave e um slug simples gravado em
// contratos.pais_destino (ex.: 'canada', 'eua', 'nova_zelandia').
export const CHECKLIST_POR_DESTINO: Record<string, ItemChecklist[]> = {
  canada: [
    { chave: "visto_canada", label: "Visto de estudo do Canadá ou eTA", tipo: "documento", tiposDocumento: ["visto", "eta"], dica: "Cursos curtos podem exigir apenas a eTA." },
    { chave: "visto_eua_transito", label: "Visto americano B1/B2 (trânsito pelos EUA)", tipo: "documento", tiposDocumento: ["visto_eua"], dica: "Necessário porque a viagem faz conexão nos Estados Unidos." },
  ],
  eua: [
    { chave: "visto_eua", label: "Visto F, M ou J", tipo: "documento", tiposDocumento: ["visto"] },
  ],
  nova_zelandia: [
    { chave: "visto_nz", label: "Visto de estudante", tipo: "documento", tiposDocumento: ["visto"] },
  ],
};

// Monta o checklist do destino (base + itens especificos). Destino nulo ou
// desconhecido cai apenas na lista-base.
export function montarChecklist(paisDestino: string | null | undefined): ItemChecklist[] {
  const extra = paisDestino ? CHECKLIST_POR_DESTINO[paisDestino] || [] : [];
  return [...CHECKLIST_BASE, ...extra];
}

// Conjunto das chaves de itens que o aluno pode marcar manualmente (tarefas).
// Usado para validar o que a API aceita alternar (documentos nao entram).
export function chavesDeTarefa(): Set<string> {
  const chaves = new Set<string>();
  const todos = [CHECKLIST_BASE, ...Object.values(CHECKLIST_POR_DESTINO)].flat();
  for (const item of todos) {
    if (item.tipo === "tarefa") chaves.add(item.chave);
  }
  return chaves;
}

// Um item de documento esta concluido se algum de seus tipos existe no cofre.
export function itemDocumentoConcluido(item: ItemChecklist, tiposPresentes: Set<string>): boolean {
  return (item.tiposDocumento || []).some((t) => tiposPresentes.has(t));
}

// Resolve o estado (concluido?) de um item, seja documento (do cofre) ou
// tarefa (das marcacoes manuais).
export function resolverConcluido(
  item: ItemChecklist,
  tiposPresentes: Set<string>,
  tarefasConcluidas: Set<string>
): boolean {
  if (item.tipo === "documento") return itemDocumentoConcluido(item, tiposPresentes);
  return tarefasConcluidas.has(item.chave);
}

// Progresso agregado do checklist, para a barra de progresso.
export function calcularProgresso(
  itens: ItemChecklist[],
  tiposPresentes: Set<string>,
  tarefasConcluidas: Set<string>
): { total: number; concluidos: number; percentual: number } {
  const total = itens.length;
  const concluidos = itens.filter((i) => resolverConcluido(i, tiposPresentes, tarefasConcluidas)).length;
  const percentual = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  return { total, concluidos, percentual };
}
