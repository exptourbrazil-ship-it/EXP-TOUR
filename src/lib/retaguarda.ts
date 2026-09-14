// Camada DETECTIVA de retaguarda (spec 1, seção 7-F; doc 01 E10 "Hold_Verificacao",
// doc 07 §3.8 "Auditoria e saúde"). Módulo PURO.
//
// Diferença para os triggers PREVENTIVOS que já existem (trava de remessa,
// conferência de fatura, gate de perfil): aqueles bloqueiam no PONTO da ação;
// a camada detectiva VARRE os dados periodicamente atrás de inconsistências que
// nenhuma ação isolada pega — o tipo de deriva silenciosa que deixou 8 pagamentos
// e R$ 13 mil passarem despercebidos (ver estado-do-portal.md / alertar-eventos).
//
// Cada verificação é uma função PURA sobre um snapshot de linhas (arrays de
// objetos simples), devolvendo zero ou mais Achados. Sem rede, sem banco: a
// camada de dados (fatia seguinte) monta o snapshot escopado por tenant e o cron
// roda o `detectarRetaguarda`. O detective NUNCA muta nem decide sozinho — ele
// FLAGRA para verificação humana (E10). Falso-positivo é aceitável: o custo de
// um "verificar" a mais é baixo; o de uma deriva de dinheiro não vista é alto.

export type SeveridadeAchado = "alto" | "medio" | "baixo";

export type Achado = {
  // Estável por caso: mesma inconsistência => mesma chave (dedupe do alerta e do
  // painel). Formato: retaguarda:<categoria>:<id da entidade>.
  chave: string;
  categoria: string;
  severidade: SeveridadeAchado;
  entidade: { tipo: string; id: string };
  contratoId: string | null;
  // Texto humano para o painel/alerta. Referencia ids (não PII sensível: sem
  // CPF, sem nome, sem valor) — coerente com a postura de log do projeto.
  resumo: string;
};

// ---- Snapshots de entrada (linhas simples, montadas pela camada de dados) ----

export type ParcelaSnapshot = {
  id: string;
  contratoId: string;
  status: string; // 'pendente' | 'pago' | ...
  paidAt: string | null;
};

export type PagamentoSnapshot = {
  parcelaId: string;
  contratoId: string;
  externalPaymentId: string;
};

export type SnapshotRetaguarda = {
  parcelas: ParcelaSnapshot[];
  pagamentos: PagamentoSnapshot[];
};

function parcelaEstaPaga(p: ParcelaSnapshot): boolean {
  return p.status === "pago";
}

/**
 * Parcela marcada como PAGA sem NENHUM lastro no ledger `pagamentos`.
 *
 * Invariante (CLAUDE.md): "dinheiro só muda de estado por webhook confirmado,
 * nunca por tela". Toda parcela paga nasce de um pagamento confirmado, que grava
 * uma linha em `pagamentos`. Uma parcela 'pago' sem essa linha é dinheiro que
 * mudou de estado sem lastro — edição manual, migração torta ou bug. ALTO.
 */
export function checarParcelaPagaSemLastro(snap: SnapshotRetaguarda): Achado[] {
  const parcelasComPagamento = new Set(snap.pagamentos.map((pg) => pg.parcelaId));
  const achados: Achado[] = [];
  for (const p of snap.parcelas) {
    if (parcelaEstaPaga(p) && !parcelasComPagamento.has(p.id)) {
      achados.push({
        chave: `retaguarda:parcela_paga_sem_lastro:${p.id}`,
        categoria: "parcela_paga_sem_lastro",
        severidade: "alto",
        entidade: { tipo: "parcela", id: p.id },
        contratoId: p.contratoId,
        resumo: `Parcela ${p.id} está 'pago' sem lastro no ledger de pagamentos (verificar).`,
      });
    }
  }
  return achados;
}

/**
 * Pagamento confirmado no ledger cuja parcela NÃO está conciliada como paga
 * (ou nem existe no snapshot). É dinheiro que entrou e a parcela não refletiu —
 * exatamente a classe do incidente dos R$ 13 mil. ALTO.
 */
export function checarPagamentoSemParcelaPaga(snap: SnapshotRetaguarda): Achado[] {
  const porId = new Map(snap.parcelas.map((p) => [p.id, p]));
  const achados: Achado[] = [];
  // Uma parcela pode ter vários pagamentos (ex.: reprocessamento); dedupe por
  // parcela para não repetir o mesmo achado.
  const jaFlagrada = new Set<string>();
  for (const pg of snap.pagamentos) {
    if (jaFlagrada.has(pg.parcelaId)) continue;
    const parcela = porId.get(pg.parcelaId);
    if (!parcela || !parcelaEstaPaga(parcela)) {
      jaFlagrada.add(pg.parcelaId);
      achados.push({
        chave: `retaguarda:pagamento_sem_parcela_paga:${pg.parcelaId}`,
        categoria: "pagamento_sem_parcela_paga",
        severidade: "alto",
        entidade: { tipo: "parcela", id: pg.parcelaId },
        contratoId: pg.contratoId,
        resumo: parcela
          ? `Pagamento confirmado (${pg.externalPaymentId}) mas a parcela ${pg.parcelaId} não está 'pago' (conciliar).`
          : `Pagamento confirmado (${pg.externalPaymentId}) aponta parcela ${pg.parcelaId} inexistente no escopo (verificar).`,
      });
    }
  }
  return achados;
}

// Catálogo de verificações. Novas verificações entram aqui (uma função pura por
// invariante) e o runner as executa todas.
export const VERIFICACOES_RETAGUARDA: Array<(snap: SnapshotRetaguarda) => Achado[]> = [
  checarParcelaPagaSemLastro,
  checarPagamentoSemParcelaPaga,
];

/**
 * Roda todas as verificações sobre o snapshot e devolve os achados ordenados por
 * severidade (alto → baixo) e depois por chave (determinístico).
 */
export function detectarRetaguarda(snap: SnapshotRetaguarda): Achado[] {
  const achados = VERIFICACOES_RETAGUARDA.flatMap((fn) => fn(snap));
  const peso: Record<SeveridadeAchado, number> = { alto: 0, medio: 1, baixo: 2 };
  return achados.sort(
    (a, b) => peso[a.severidade] - peso[b.severidade] || a.chave.localeCompare(b.chave),
  );
}

// ---- Reconciliação com o estado persistido ---------------------------------
//
// O detective roda periodicamente. Cada achado é PERSISTIDO por `chave` estável,
// não só alertado: o painel de saúde precisa mostrar o que está ABERTO agora e o
// histórico. A reconciliação compara a detecção de hoje com o que já está no
// banco e decide o que abrir/reabrir/manter/resolver — pura e testável; a camada
// de dados aplica o plano.

export type StatusAchado = "aberto" | "resolvido";
export type AchadoPersistido = { chave: string; status: StatusAchado };

export type PlanoReconciliacao = {
  abrir: Achado[]; // novo: não havia registro
  reabrir: Achado[]; // havia registro RESOLVIDO e a inconsistência voltou
  manter: Achado[]; // já aberto e ainda presente (só atualiza "visto por último")
  resolver: string[]; // chaves ABERTAS que sumiram: a inconsistência foi corrigida
};

/**
 * Decide o plano de reconciliação entre os achados detectados AGORA (`atuais`) e
 * os já persistidos (`persistidos`). Determinístico e sem efeito colateral.
 *
 * - `atuais` sem registro           -> abrir
 * - `atuais` com registro resolvido -> reabrir (voltou; nunca silencioso)
 * - `atuais` com registro aberto    -> manter
 * - persistido ABERTO que sumiu     -> resolver (corrigido)
 *
 * Persistidos com status 'resolvido' que continuam ausentes ficam como estão.
 */
export function reconciliarAchados(
  atuais: Achado[],
  persistidos: AchadoPersistido[],
): PlanoReconciliacao {
  const statusPorChave = new Map<string, StatusAchado>();
  for (const p of persistidos) statusPorChave.set(p.chave, p.status);

  const plano: PlanoReconciliacao = { abrir: [], reabrir: [], manter: [], resolver: [] };
  const chavesAtuais = new Set<string>();

  for (const a of atuais) {
    if (chavesAtuais.has(a.chave)) continue; // dedupe defensivo
    chavesAtuais.add(a.chave);
    const status = statusPorChave.get(a.chave);
    if (status === undefined) plano.abrir.push(a);
    else if (status === "resolvido") plano.reabrir.push(a);
    else plano.manter.push(a);
  }

  for (const p of persistidos) {
    if (p.status === "aberto" && !chavesAtuais.has(p.chave)) plano.resolver.push(p.chave);
  }

  return plano;
}
