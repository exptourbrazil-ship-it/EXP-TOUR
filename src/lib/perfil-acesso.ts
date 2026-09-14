// Motor PURO dos PERFIS DE ACESSO da Área do Cliente (spec 1, seção 3). O
// contrato prevê três papéis distintos para quem acessa o portal, e cada um vê
// só o que lhe cabe:
//
//  - CONTRATANTE — quem contrata e paga. Acesso pleno: financeiro, valores,
//    pagamento, documentos, andamento do programa. É o comportamento atual.
//  - PARTICIPANTE — o estudante. NUNCA vê saldo, valores ou o financeiro
//    (Cláusula 5.4.4 + LGPD: dado financeiro do contratante não é do estudante).
//    Vê os próprios documentos e o andamento do programa (datas, embarque…).
//  - TERCEIRO PAGADOR — quem paga sem ser o contratante. Vê SÓ o comprovante do
//    que ELE pagou; nada de saldo, plano, documentos ou andamento.
//
// Este módulo só DECIDE (matriz papel × capacidade). O enforcement (sessão,
// rotas, telas) é das fatias seguintes. SEM imports — roda no runner nativo do
// Node; puro/determinístico.

export type PerfilTitular = "contratante" | "participante" | "terceiro_pagador";

// Capacidades observáveis na Área do Cliente. Grão pensado para gatear telas e
// rotas: cada uma responde "este perfil pode ver/fazer isto?".
export type CapacidadeCliente =
  | "financeiro.ver" // aba Financeiro: saldo, em aberto, régua de cobrança
  | "valores.ver" // valores do programa/parcelas/câmbio em qualquer tela
  | "pagamento.gerir" // gerar cobrança, pagar, antecipar, ajustar parcelas
  | "documentos.ver" // cofre de documentos do titular
  | "programa.ver" // datas, contagem regressiva, embarque/viagem/retorno, ficha
  | "recibos_proprios.ver"; // comprovantes SOMENTE do que este perfil pagou

// O perfil PADRÃO quando nada está gravado. Retrocompatibilidade: os titulares
// existentes (sem coluna/valor de perfil) continuam com ACESSO PLENO — não se
// introduz bloqueio silencioso ao ligar a modelagem. A restrição só vale para
// quem for marcado explicitamente como participante/terceiro pagador.
export const PERFIL_PADRAO: PerfilTitular = "contratante";

// Matriz papel × capacidade. Fonte única de verdade do que cada perfil vê.
// Ausente = negado.
const MATRIZ: Record<PerfilTitular, ReadonlySet<CapacidadeCliente>> = {
  contratante: new Set<CapacidadeCliente>([
    "financeiro.ver",
    "valores.ver",
    "pagamento.gerir",
    "documentos.ver",
    "programa.ver",
    "recibos_proprios.ver",
  ]),
  // Estudante: TUDO menos dinheiro. Bloqueio financeiro é a razão de ser deste
  // perfil (5.4.4 + LGPD) — nunca conceder financeiro/valores/pagamento/recibos.
  participante: new Set<CapacidadeCliente>([
    "documentos.ver",
    "programa.ver",
  ]),
  // Terceiro pagador: só o comprovante do que ELE pagou. Nada além disso.
  terceiro_pagador: new Set<CapacidadeCliente>([
    "recibos_proprios.ver",
  ]),
};

// Normaliza uma entrada crua (coluna do banco, campo de sessão) para um perfil
// válido. Qualquer valor desconhecido/ausente cai no PADRÃO (contratante) —
// falha para o lado do comportamento atual, não para bloqueio acidental.
export function normalizarPerfil(v: unknown): PerfilTitular {
  if (v === "participante" || v === "terceiro_pagador" || v === "contratante") return v;
  return PERFIL_PADRAO;
}

export function perfilValido(v: unknown): v is PerfilTitular {
  return v === "participante" || v === "terceiro_pagador" || v === "contratante";
}

// A pergunta central: este perfil PODE esta capacidade? Entrada crua é
// normalizada antes de decidir (nunca "abre" por valor inesperado além do
// padrão de retrocompatibilidade).
export function podeCliente(perfil: unknown, cap: CapacidadeCliente): boolean {
  const p = normalizarPerfil(perfil);
  return MATRIZ[p].has(cap);
}

// Atalho legível: o Participante nunca vê dinheiro. Concentra a invariante mais
// sensível (5.4.4 + LGPD) num único predicado para as telas/rotas checarem.
export function podeVerFinanceiro(perfil: unknown): boolean {
  return podeCliente(perfil, "financeiro.ver");
}

// Rótulos para a UI (menu de conta, admin). Sem lógica de acesso aqui.
export const PERFIS: { valor: PerfilTitular; rotulo: string }[] = [
  { valor: "contratante", rotulo: "Contratante" },
  { valor: "participante", rotulo: "Participante (estudante)" },
  { valor: "terceiro_pagador", rotulo: "Terceiro pagador" },
];

export function rotuloPerfil(perfil: unknown): string {
  const p = normalizarPerfil(perfil);
  return PERFIS.find((x) => x.valor === p)!.rotulo;
}
