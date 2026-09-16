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

// Soma `dias` (pode ser negativo) a uma data ISO (YYYY-MM-DD), em UTC. Usado
// pela camada de dados para a janela de alerta antes do embarque (Seguro).
export function adicionarDiasISO(dataISO: string, dias: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + dias * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Soma `meses` a uma data ISO (YYYY-MM-DD), devolvendo YYYY-MM-DD. Calendário
// puro (UTC, sem fuso). Estouro de dia (ex.: 31 -> mês curto) normaliza para o
// último dia do mês alvo. Usado pela camada de dados para a data-limite de
// validade do documento (início do programa + buffer de meses do tenant).
export function adicionarMesesISO(dataISO: string, meses: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1; // 0-based
  const dia = Number(m[3]);
  const alvo = new Date(Date.UTC(ano, mes + meses, 1));
  const ultimoDiaAlvo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDiaAlvo));
  return alvo.toISOString().slice(0, 10);
}

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

// Documento VISÍVEL ao fornecedor (compartilhado_fornecedor = true — o governador
// da visibilidade da escola), com o carimbo do compartilhamento e a janela de
// arrependimento, para a checagem de D+7. `compartilhadoEmISO` pode ser nulo
// (visível sem carimbo de data → impossível verificar o D+7 → achado próprio).
// `janelaFimISO` = fim gravado no contrato ou derivado do aceite + 7 dias.
// `processamentoImediatoMarcadoEmISO` = quando a autorização foi marcada (a
// isenção só vale se a autorização é anterior ao compartilhamento; marcação
// retroativa não apaga uma violação passada).
export type DocCompartilhadoSnapshot = {
  docId: string;
  contratoId: string;
  compartilhadoEmISO: string | null;
  janelaFimISO: string | null;
  processamentoImediato: boolean;
  processamentoImediatoMarcadoEmISO: string | null;
};

// Alteração de ESCOPO (E3) que muda o valor do programa. Um aditivo de COMPRA
// (delta>0) aplicado exige o aceite eletrônico do cliente (aditivo_aceito_em). O
// sinal-verdade do aumento de preço é `delta > 0`, NÃO o rótulo `sentido` (que é
// nullable e derivado — uma aplicação direta por SQL pode gravar delta>0 com
// sentido nulo). A camada de dados só traz as aplicadas de escopo com delta>0.
export type AlteracaoSnapshot = {
  id: string;
  contratoId: string;
  tipo: string; // 'deferral' | 'escopo'
  status: string; // 'rascunho' | 'aplicado' | 'cancelado'
  delta: number | null; // novo - atual (na moeda); > 0 = aditivo de compra
  aditivoAceitoEmISO: string | null;
};

// Repactuação do cronograma (Cláusula 7.11) APLICADA. O aceite eletrônico do
// cliente (`aceito_em`) é o que vale como ADITIVO — uma repactuação aplicada sem
// esse carimbo mudou o cronograma sem o consentimento que a cláusula exige. Os
// dois caminhos legítimos (self-service e aprovação admin) sempre gravam
// `aceito_em`; a ausência é a deriva (aplicação direta por SQL, migração, bug).
export type RepactuacaoSnapshot = {
  id: string;
  contratoId: string;
  status: string; // 'aguardando_aprovacao' | 'aplicada' | 'recusada' | 'cancelada'
  aceitoEmISO: string | null;
};

// Documento com carimbo de VALIDADE (ex.: passaporte), para o agente de Vistos
// (§7-F.1): a validade tem de cobrir a exigência do destino. `referenciaISO` é a
// data-limite até a qual o documento PRECISA continuar válido — a camada de
// dados a calcula (início do programa + buffer de meses do tenant), mantendo o
// motor puro (sem aritmética de mês nem config). `validadeISO` é a data de
// expiração gravada no documento.
export type DocValidadeSnapshot = {
  docId: string;
  contratoId: string;
  validadeISO: string; // data de expiração do documento (YYYY-MM-DD)
  referenciaISO: string; // até quando precisa continuar válido (início + buffer)
};

// Tipo de documento que marca uma CARTA DE RECUSA DE VISTO. A camada de dados
// filtra por ele; exportado para ficar num lugar só (domínio de Vistos).
export const TIPO_CARTA_RECUSA_VISTO = "carta_recusa_visto";

// Prazo de repasse da carta de recusa ao Fornecedor: 1 dia ÚTIL do recebimento
// (Cláusula 10.3.1). Constante contratual (não é parâmetro tunável por tenant,
// como o spread) — igual ao D+7 ser fixo por contrato.
export const PRAZO_REPASSE_CARTA_RECUSA_DIAS_UTEIS = 1;

// Carta de recusa de visto recebida, para o agente de Vistos (§7-F.1, "prazo
// para apresentação da carta de recusa"). `prazoRepasseISO` é a data-limite de
// repasse ao fornecedor (recebimento + 1 dia útil), calculada na camada de dados
// com o calendário de feriados — o motor puro só compara datas. `hojeISO` é o
// dia de referência (o mesmo para todas as linhas). `compartilhado` = já
// repassado ao fornecedor.
export type CartaRecusaSnapshot = {
  docId: string;
  contratoId: string;
  compartilhado: boolean;
  prazoRepasseISO: string;
  hojeISO: string;
};

// Contrato ATIVO com embarque próximo/passado, para o agente de Seguro (§7-F.1,
// "apólice apresentada antes do embarque"). `temSeguro` = o titular tem algum
// documento de seguro-saúde no acervo. `limiteAlertaISO` = data de início do
// programa menos a janela de antecedência (calculada na camada de dados). Se o
// embarque está dentro da janela (ou já passou) e não há apólice, alerta.
export type SeguroContratoSnapshot = {
  contratoId: string;
  temSeguro: boolean;
  limiteAlertaISO: string;
  hojeISO: string;
};

// Vigência do seguro de um contrato, para o agente de Seguro (§7-F.1, "vigência
// cobrindo todo o período"). `coberturaAteISO` = maior validade entre as
// apólices do titular (fim da cobertura). `referenciaISO` = até quando a
// cobertura precisa alcançar. v1: referência = início do programa (uma apólice
// que expira antes do embarque não cobre o período); quando houver data de
// término do programa, a referência sobe para o fim.
export type SeguroVigenciaSnapshot = {
  contratoId: string;
  coberturaAteISO: string;
  referenciaISO: string;
};

// Cobertura do seguro vs. mínimo do destino, para o agente de Seguro (§7-F.1,
// "cobertura contra o mínimo do destino"). A camada de dados resolve a MESMA
// moeda (mínimo do país × maior cobertura do titular naquela moeda) e traz os
// dois valores comparáveis; o motor só compara. `moeda` é só para o resumo.
export type SeguroCoberturaSnapshot = {
  contratoId: string;
  coberturaValor: number;
  minimoValor: number;
  moeda: string;
};

// Requisitos publicados do consulado, para o agente de Vistos (§7-F.1,
// "Requisitos publicados do consulado"). `exigidos` = tipos de documento que o
// consulado do destino exige (do config por tenant/país); `presentes` = tipos
// que o titular JÁ tem no acervo. O motor calcula o que falta (exigidos −
// presentes) e sinaliza quando há requisito não atendido. `pais` é só para o
// resumo. A camada de dados só monta o snapshot quando o país tem requisitos
// configurados E o programa ainda não começou (janela preventiva).
export type RequisitoConsuladoSnapshot = {
  contratoId: string;
  pais: string;
  exigidos: string[];
  presentes: string[];
};

// Consistência de identidade entre os documentos do titular, para o agente de
// Documentação (§7-F.1, "consistência de nome, data de nascimento e passaporte
// entre todos os documentos"). Cada array traz os valores BRUTOS de um campo
// coletados dos documentos do titular MAIS a âncora canônica (nome do titular;
// data de nascimento do contrato). O motor normaliza e conta valores distintos
// não-vazios por campo; 2+ distintos = divergência. O resumo cita só o NOME do
// campo divergente — nunca o valor (é PII).
export type DocumentacaoIdentidadeSnapshot = {
  contratoId: string;
  nomes: string[];
  nascimentos: string[];
  passaportes: string[];
};

// Datas do bilhete vs. início do programa, para o agente de Passagens (§7-F.1,
// "datas do bilhete compatíveis com as do Programa"). `vooIdaISO` = a ida MAIS
// PRÓXIMA do início entre os bilhetes do titular (a camada de dados escolhe a
// melhor). A janela aceitável [`limiteAntesISO`, `limiteDepoisISO`] = início ±
// tolerância. Fora dela, a ida é incompatível (chegou tarde demais para começar,
// ou cedo/errada demais — provável data trocada).
export type PassagemSnapshot = {
  contratoId: string;
  vooIdaISO: string;
  limiteAntesISO: string;
  limiteDepoisISO: string;
};

// Compra do bilhete vs. visto, para o agente de Passagens (§7-F.1, "compra
// posterior à confirmação e ao visto"). `compraISO` = data de compra mais ANTIGA
// entre os bilhetes do titular; `vistoISO` = data (created_at) do documento de
// visto mais ANTIGO do titular — o marco a partir do qual comprar é seguro.
// Comprar antes de ter o visto em mãos arrisca o valor do bilhete se o visto for
// negado. A camada de dados só monta o snapshot quando AMBOS existem.
export type PassagemCompraSnapshot = {
  contratoId: string;
  compraISO: string;
  vistoISO: string;
};

// Data de VOLTA do bilhete vs. fim do programa, para o agente de Passagens
// (§7-F.1, "datas do bilhete compatíveis com as do Programa" — o lado da volta).
// `vooVoltaISO` = a volta MAIS TARDIA entre os bilhetes do titular (a candidata
// mais favorável: se nem ela cobre o fim, nenhuma cobre). `limiteVoltaISO` = a
// data mínima aceitável de volta = fim do programa − tolerância. Uma volta
// anterior a esse limite leva o estudante embora antes de terminar o programa
// (provável data trocada). A camada de dados só monta o snapshot quando o
// contrato TEM fim (data_fim) E há bilhete com data de volta.
export type PassagemVoltaSnapshot = {
  contratoId: string;
  vooVoltaISO: string;
  limiteVoltaISO: string;
  fimProgramaISO: string;
};

export type SnapshotRetaguarda = {
  parcelas: ParcelaSnapshot[];
  pagamentos: PagamentoSnapshot[];
  // Opcionais para retrocompatibilidade dos testes antigos; a camada de dados
  // sempre preenche. As verificações que não os usam ignoram.
  docsCompartilhados?: DocCompartilhadoSnapshot[];
  alteracoes?: AlteracaoSnapshot[];
  repactuacoes?: RepactuacaoSnapshot[];
  docsValidade?: DocValidadeSnapshot[];
  cartasRecusa?: CartaRecusaSnapshot[];
  segurosContrato?: SeguroContratoSnapshot[];
  segurosVigencia?: SeguroVigenciaSnapshot[];
  segurosCobertura?: SeguroCoberturaSnapshot[];
  requisitosConsulado?: RequisitoConsuladoSnapshot[];
  documentacaoIdentidade?: DocumentacaoIdentidadeSnapshot[];
  passagens?: PassagemSnapshot[];
  passagensCompra?: PassagemCompraSnapshot[];
  passagensVolta?: PassagemVoltaSnapshot[];
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

/**
 * Documento COMPARTILHADO com o fornecedor ANTES do fim do prazo de arrependimento
 * (D+7), sem processamento imediato autorizado.
 *
 * Camada detectiva da "trava D+7" (§7-D): o controle preventivo bloqueia o
 * compartilhamento na ação; este confere o que passou — e-mail manual fora do
 * sistema, bug, ou carimbo tardio. Compara `compartilhado_em` com a janela de
 * arrependimento (Cláusula 2.5.2 / CDC art. 49). ALTO (peso jurídico).
 *
 * Não flagra quando: processamento imediato (exceção expressa do contrato) ou
 * sem janela conhecida (defensivo — igual à trava, que não bloqueia sem âncora).
 */
export function checarRemessaAntesDoD7(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const d of snap.docsCompartilhados ?? []) {
    // Visível ao fornecedor SEM carimbo de data: impossível verificar o D+7 —
    // exatamente a deriva "fora do sistema / carimbo tardio". Achado próprio.
    if (!d.compartilhadoEmISO) {
      achados.push({
        chave: `retaguarda:compartilhado_sem_carimbo:${d.docId}`,
        categoria: "compartilhado_sem_carimbo",
        severidade: "alto",
        entidade: { tipo: "documento", id: d.docId },
        contratoId: d.contratoId,
        resumo: `Documento ${d.docId} está visível ao fornecedor sem carimbo de data — impossível verificar o D+7 (verificar).`,
      });
      continue;
    }

    const compartilhado = new Date(d.compartilhadoEmISO).getTime();

    // Processamento imediato isenta — SALVO prova de que a autorização veio
    // DEPOIS do compartilhamento (marcação retroativa não apaga uma violação
    // passada). Sem essa prova (autorização anterior/ao mesmo tempo, ou sem
    // carimbo de autorização), a isenção vale.
    if (d.processamentoImediato) {
      const marcado = d.processamentoImediatoMarcadoEmISO
        ? new Date(d.processamentoImediatoMarcadoEmISO).getTime()
        : NaN;
      const autorizacaoRetroativa =
        Number.isFinite(marcado) && Number.isFinite(compartilhado) && marcado > compartilhado;
      if (!autorizacaoRetroativa) continue;
    }

    if (!d.janelaFimISO) continue;
    const fim = new Date(d.janelaFimISO).getTime();
    if (!Number.isFinite(compartilhado) || !Number.isFinite(fim)) continue;
    // `<=` (não `<`) para paridade com a trava preventiva, que só LIBERA quando
    // agora > fim (bloqueia enquanto agora <= fim).
    if (compartilhado <= fim) {
      achados.push({
        chave: `retaguarda:remessa_antes_do_d7:${d.docId}`,
        categoria: "remessa_antes_do_d7",
        severidade: "alto",
        entidade: { tipo: "documento", id: d.docId },
        contratoId: d.contratoId,
        resumo: `Documento ${d.docId} compartilhado com o fornecedor antes do fim do prazo de arrependimento (D+7) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Alteração de PREÇO (aditivo de compra, E3 delta>0) APLICADA sem o aceite
 * eletrônico do cliente registrado.
 *
 * Camada detectiva de "alteração de preço com aceite" (§7-D): o controle
 * preventivo recusa aplicar o aditivo sem `aditivo_aceito_em`
 * (alteracao-service). Este pega o que passou fora do sistema. ALTO (o cliente
 * teria sido cobrado a mais sem consentir).
 */
export function checarAlteracaoSemAceite(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const a of snap.alteracoes ?? []) {
    // Aumento de preço = delta>0 (o sinal-verdade), não o rótulo `sentido`. Assim
    // pega também a aplicação direta por SQL que grava delta>0 com sentido nulo —
    // justamente o caminho que não passa pelo gate preventivo (que checa sentido).
    const ehAditivoAplicado =
      a.status === "aplicado" && a.tipo === "escopo" && (a.delta ?? 0) > 0;
    if (ehAditivoAplicado && !a.aditivoAceitoEmISO) {
      achados.push({
        chave: `retaguarda:alteracao_sem_aceite:${a.id}`,
        categoria: "alteracao_sem_aceite",
        severidade: "alto",
        entidade: { tipo: "alteracao", id: a.id },
        contratoId: a.contratoId,
        resumo: `Alteração de preço (aditivo) ${a.id} aplicada sem aceite do cliente registrado — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Repactuação do cronograma (Cláusula 7.11) APLICADA sem o aceite eletrônico do
 * cliente registrado.
 *
 * Camada detectiva de "repactuação com aceite" (§7-D): o serviço de repactuação
 * recusa aplicar sem `aceito_em` (aceite_obrigatorio) — tanto no self-service
 * quanto na aprovação admin, que só aplica uma solicitação do cliente já aceita.
 * Este pega o que passou fora do sistema: uma repactuação 'aplicada' sem carimbo
 * de aceite reescreveu o cronograma sem o aditivo que a cláusula exige. ALTO
 * (peso jurídico — o cliente não consentiu com o novo cronograma).
 */
export function checarRepactuacaoSemAceite(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const r of snap.repactuacoes ?? []) {
    if (r.status === "aplicada" && !r.aceitoEmISO) {
      achados.push({
        chave: `retaguarda:repactuacao_sem_aceite:${r.id}`,
        categoria: "repactuacao_sem_aceite",
        severidade: "alto",
        entidade: { tipo: "repactuacao", id: r.id },
        contratoId: r.contratoId,
        resumo: `Repactuação ${r.id} aplicada sem aceite do cliente registrado — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Documento (ex.: passaporte) cuja VALIDADE não cobre a exigência do destino —
 * expira antes da data-limite em que ainda precisa estar válido.
 *
 * Agente de Vistos (§7-F.1, "janelas de validade de documento"): a camada de
 * dados traz, por documento com validade gravada, a `referenciaISO` = início do
 * programa + buffer mínimo de meses do tenant. Se a validade é ANTERIOR à
 * referência, o documento vence cedo demais — risco de recusa de visto / embarque
 * negado. Comparação só de datas-calendário (YYYY-MM-DD), sem fuso.
 *
 * MÉDIO (não é dinheiro; e é auto-resolúvel — renovar o passaporte e atualizar a
 * validade fecha o caso sem precisar de ack humano). Só verifica documentos que
 * TÊM validade gravada; documento sem validade é lacuna de outro agente
 * (Documentação/checklist), não deste.
 */
export function checarDocumentoValidadeInsuficiente(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const d of snap.docsValidade ?? []) {
    if (!d.validadeISO || !d.referenciaISO) continue;
    // Datas no formato YYYY-MM-DD comparam corretamente por ordem lexicográfica.
    if (d.validadeISO < d.referenciaISO) {
      achados.push({
        chave: `retaguarda:documento_validade_insuficiente:${d.docId}`,
        categoria: "documento_validade_insuficiente",
        severidade: "medio",
        entidade: { tipo: "documento", id: d.docId },
        contratoId: d.contratoId,
        resumo: `Documento ${d.docId} expira (${d.validadeISO}) antes da validade mínima exigida para o programa (${d.referenciaISO}) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Carta de recusa de visto recebida e NÃO repassada ao Fornecedor dentro do
 * prazo de 1 dia útil (Cláusula 10.3.1).
 *
 * Agente de Vistos (§7-F.1, "prazo para apresentação da carta de recusa"): a
 * camada de dados calcula, por carta recebida, `prazoRepasseISO` = recebimento +
 * 1 dia útil (calendário de feriados). Se a carta ainda NÃO foi compartilhada com
 * o fornecedor e a data de referência (`hojeISO`) já passou do prazo, o repasse
 * está atrasado — o fornecedor precisa da carta para os próximos passos e o
 * atraso trava o processo. MÉDIO (SLA operacional / "tarefa com prazo"; resolve
 * de fato ao repassar — sem atrito de ack, como o vencimento de documento).
 *
 * Só compara datas YYYY-MM-DD (sem fuso); o cálculo de dias úteis fica na camada
 * de dados, que tem o calendário.
 */
export function checarCartaRecusaNaoRepassada(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const c of snap.cartasRecusa ?? []) {
    if (c.compartilhado) continue; // já repassada: nada a cobrar
    if (!c.prazoRepasseISO || !c.hojeISO) continue;
    if (c.hojeISO > c.prazoRepasseISO) {
      achados.push({
        chave: `retaguarda:carta_recusa_visto_atrasada:${c.docId}`,
        categoria: "carta_recusa_visto_atrasada",
        severidade: "medio",
        entidade: { tipo: "documento", id: c.docId },
        contratoId: c.contratoId,
        resumo: `Carta de recusa de visto ${c.docId} não repassada ao fornecedor no prazo de 1 dia útil (limite ${c.prazoRepasseISO}) — repassar.`,
      });
    }
  }
  return achados;
}

/**
 * Contrato com embarque próximo (ou já passado) e SEM apólice de seguro no
 * acervo do titular.
 *
 * Agente de Seguro (§7-F.1, "apólice apresentada antes do embarque"): a camada
 * de dados traz, por contrato ativo com data de início, se o titular tem algum
 * documento de seguro-saúde e o `limiteAlertaISO` (início − janela de
 * antecedência). Se o embarque está dentro da janela ou já ocorreu e não há
 * apólice, o cliente pode viajar sem seguro. MÉDIO (operacional / "alerta
 * escalonado"; resolve quando a apólice é anexada — sem atrito de ack).
 *
 * Só compara datas YYYY-MM-DD; a janela e a exclusão de cancelados ficam na
 * camada de dados.
 */
export function checarSeguroAusenteAntesEmbarque(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const s of snap.segurosContrato ?? []) {
    if (s.temSeguro) continue; // já há apólice: nada a cobrar
    if (!s.limiteAlertaISO || !s.hojeISO) continue;
    if (s.hojeISO >= s.limiteAlertaISO) {
      achados.push({
        chave: `retaguarda:seguro_ausente_embarque:${s.contratoId}`,
        categoria: "seguro_ausente_embarque",
        severidade: "medio",
        entidade: { tipo: "contrato", id: s.contratoId },
        contratoId: s.contratoId,
        resumo: `Contrato ${s.contratoId} com embarque próximo/ocorrido e sem apólice de seguro no acervo — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Seguro cuja vigência NÃO cobre o período do programa — a cobertura termina
 * antes da data de referência.
 *
 * Agente de Seguro (§7-F.1, "vigência cobrindo todo o período"): a camada de
 * dados traz, por contrato ativo cujo titular tem apólice com validade, a maior
 * validade (`coberturaAteISO`) e a `referenciaISO` até a qual a cobertura precisa
 * alcançar (v1: início do programa). Se a cobertura termina ANTES da referência,
 * o seguro não cobre o período. MÉDIO (operacional; resolve quando a apólice é
 * renovada/atualizada, sem atrito de ack).
 *
 * Só flagra quando HÁ apólice com validade registrada (a ausência de apólice é a
 * outra checagem). Compara só datas YYYY-MM-DD.
 */
export function checarSeguroVigenciaInsuficiente(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const s of snap.segurosVigencia ?? []) {
    if (!s.coberturaAteISO || !s.referenciaISO) continue;
    if (s.coberturaAteISO < s.referenciaISO) {
      achados.push({
        chave: `retaguarda:seguro_vigencia_insuficiente:${s.contratoId}`,
        categoria: "seguro_vigencia_insuficiente",
        severidade: "medio",
        entidade: { tipo: "contrato", id: s.contratoId },
        contratoId: s.contratoId,
        resumo: `Contrato ${s.contratoId}: apólice de seguro expira (${s.coberturaAteISO}) antes do período do programa (ref. ${s.referenciaISO}) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Seguro cuja COBERTURA está abaixo do mínimo exigido pelo destino.
 *
 * Agente de Seguro (§7-F.1, "cobertura contra o mínimo do destino"): a camada de
 * dados resolve o mínimo do país do contrato e a MAIOR cobertura do titular na
 * mesma moeda; traz os dois valores comparáveis. Se a cobertura é MENOR que o
 * mínimo, a apólice não atende o destino. MÉDIO (resolve ao contratar cobertura
 * adequada). Só compara na MESMA moeda (a camada de dados garante isso);
 * moedas diferentes ficam de fora (exigiria conversão cambial).
 */
export function checarSeguroCoberturaAbaixoMinimo(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const s of snap.segurosCobertura ?? []) {
    if (!Number.isFinite(s.coberturaValor) || !Number.isFinite(s.minimoValor) || s.minimoValor <= 0) continue;
    if (s.coberturaValor < s.minimoValor) {
      achados.push({
        chave: `retaguarda:seguro_cobertura_abaixo_minimo:${s.contratoId}`,
        categoria: "seguro_cobertura_abaixo_minimo",
        severidade: "medio",
        entidade: { tipo: "contrato", id: s.contratoId },
        contratoId: s.contratoId,
        resumo: `Contrato ${s.contratoId}: cobertura do seguro (${s.coberturaValor} ${s.moeda}) abaixo do mínimo do destino (${s.minimoValor} ${s.moeda}) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Data de IDA do bilhete INCOMPATÍVEL com o início do programa.
 *
 * Agente de Passagens (§7-F.1, "datas do bilhete compatíveis com as do
 * Programa"): a camada de dados escolhe, entre os bilhetes do titular, a ida mais
 * próxima do início e traz a janela aceitável (início ± tolerância). Se a ida cai
 * FORA da janela — depois do início (chegou tarde para começar) ou cedo/errada
 * demais — a passagem não bate com o programa. MÉDIO (resolve ao corrigir o
 * bilhete/data). Só compara datas YYYY-MM-DD; a janela é da camada de dados.
 */
// Normalizadores puros para a comparação de identidade (agente de Documentação).
// Nome: sem acento, maiúsculo, espaços colapsados — "José  da Silva" == "JOSE DA
// SILVA". Passaporte: maiúsculo, só alfanumérico — "fd-123.456" == "FD123456".
// Data: já ISO, só o dia. Vazio some (não conta como valor).
function normalizarNome(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function normalizarPassaporte(s: string): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function distintosNaoVazios(valores: string[], norm: (s: string) => string): number {
  const set = new Set<string>();
  for (const v of valores ?? []) {
    const n = norm(v ?? "");
    if (n) set.add(n);
  }
  return set.size;
}

/**
 * Inconsistência de identidade entre os documentos do titular (§7-F.1, agente de
 * Documentação, "consistência de nome, data de nascimento e passaporte entre
 * todos os documentos").
 *
 * A camada de dados traz, por contrato, os valores de cada campo coletados dos
 * documentos do titular mais a âncora canônica. O motor normaliza e conta valores
 * distintos por campo; 2+ distintos = os documentos discordam naquele campo.
 * MÉDIO (resolve com verificação humana / correção do documento). O resumo cita
 * só o NOME do campo divergente — nunca o valor (PII).
 */
export function checarDocumentacaoInconsistente(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const d of snap.documentacaoIdentidade ?? []) {
    const campos: string[] = [];
    if (distintosNaoVazios(d.nomes, normalizarNome) > 1) campos.push("nome");
    if (distintosNaoVazios(d.nascimentos, (s) => (s ?? "").slice(0, 10)) > 1) campos.push("data de nascimento");
    if (distintosNaoVazios(d.passaportes, normalizarPassaporte) > 1) campos.push("passaporte");
    if (campos.length > 0) {
      achados.push({
        chave: `retaguarda:documentacao_inconsistente:${d.contratoId}`,
        categoria: "documentacao_inconsistente",
        severidade: "medio",
        entidade: { tipo: "contrato", id: d.contratoId },
        contratoId: d.contratoId,
        resumo: `Contrato ${d.contratoId}: divergência entre os documentos em ${campos.join(", ")} — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Requisitos publicados do consulado não atendidos (§7-F.1, agente de Vistos,
 * "Requisitos publicados do consulado").
 *
 * A camada de dados traz, por contrato cujo destino tem checklist configurado, os
 * tipos de documento `exigidos` pelo consulado e os `presentes` no acervo do
 * titular. O motor calcula os FALTANTES (exigidos − presentes) e sinaliza quando
 * algum requisito não está atendido. MÉDIO (operacional; resolve ao subir o
 * documento). O resumo lista só slugs de tipo de documento — sem PII.
 */
export function checarRequisitosConsulado(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const r of snap.requisitosConsulado ?? []) {
    if (!r.exigidos || r.exigidos.length === 0) continue;
    const presentes = new Set(r.presentes ?? []);
    const faltantes = r.exigidos.filter((t) => !presentes.has(t));
    if (faltantes.length > 0) {
      achados.push({
        chave: `retaguarda:requisitos_consulado:${r.contratoId}`,
        categoria: "requisitos_consulado_incompletos",
        severidade: "medio",
        entidade: { tipo: "contrato", id: r.contratoId },
        contratoId: r.contratoId,
        resumo: `Contrato ${r.contratoId}: documentos exigidos pelo consulado do destino (${r.pais}) ausentes no acervo: ${faltantes.join(", ")} — verificar.`,
      });
    }
  }
  return achados;
}

export function checarPassagemDatasIncompativeis(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const p of snap.passagens ?? []) {
    if (!p.vooIdaISO || !p.limiteAntesISO || !p.limiteDepoisISO) continue;
    if (p.vooIdaISO < p.limiteAntesISO || p.vooIdaISO > p.limiteDepoisISO) {
      achados.push({
        chave: `retaguarda:passagem_datas_incompativeis:${p.contratoId}`,
        categoria: "passagem_datas_incompativeis",
        severidade: "medio",
        entidade: { tipo: "contrato", id: p.contratoId },
        contratoId: p.contratoId,
        resumo: `Contrato ${p.contratoId}: data de ida do bilhete (${p.vooIdaISO}) fora da janela compatível com o início do programa (${p.limiteAntesISO} a ${p.limiteDepoisISO}) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Bilhete COMPRADO antes de o visto estar no acervo (§7-F.1, "compra posterior à
 * confirmação e ao visto").
 *
 * A camada de dados só monta o snapshot quando o titular TEM documento de visto
 * (com data) E bilhete com data de compra. Se a compra (mais antiga) é ANTERIOR à
 * data do visto (mais antigo), o bilhete foi comprado sem o visto em mãos — risco
 * de perder o valor se o visto for negado. MÉDIO (alerta; resolve com verificação
 * humana / remarcação). Só compara datas YYYY-MM-DD.
 */
export function checarPassagemCompraAntesVisto(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const p of snap.passagensCompra ?? []) {
    if (!p.compraISO || !p.vistoISO) continue;
    if (p.compraISO < p.vistoISO) {
      achados.push({
        chave: `retaguarda:passagem_compra_antes_visto:${p.contratoId}`,
        categoria: "passagem_compra_antes_visto",
        severidade: "medio",
        entidade: { tipo: "contrato", id: p.contratoId },
        contratoId: p.contratoId,
        resumo: `Contrato ${p.contratoId}: bilhete comprado (${p.compraISO}) antes de o visto estar no acervo (${p.vistoISO}) — verificar.`,
      });
    }
  }
  return achados;
}

/**
 * Bilhete de VOLTA anterior ao fim do programa (§7-F.1, "datas do bilhete
 * compatíveis com as do Programa" — o lado da volta).
 *
 * A camada de dados escolhe a volta MAIS TARDIA do titular e traz o limite
 * mínimo aceitável (fim do programa − tolerância). Se nem a volta mais tardia
 * alcança esse limite, TODAS as voltas são anteriores ao fim — o estudante iria
 * embora antes de terminar o programa (provável data trocada). MÉDIO (resolve ao
 * corrigir o bilhete/data). Só compara datas YYYY-MM-DD; o limite é da camada de
 * dados.
 */
export function checarPassagemVoltaAntesDoFim(snap: SnapshotRetaguarda): Achado[] {
  const achados: Achado[] = [];
  for (const p of snap.passagensVolta ?? []) {
    if (!p.vooVoltaISO || !p.limiteVoltaISO) continue;
    if (p.vooVoltaISO < p.limiteVoltaISO) {
      achados.push({
        chave: `retaguarda:passagem_volta_antes_fim:${p.contratoId}`,
        categoria: "passagem_volta_antes_fim",
        severidade: "medio",
        entidade: { tipo: "contrato", id: p.contratoId },
        contratoId: p.contratoId,
        resumo: `Contrato ${p.contratoId}: data de volta do bilhete (${p.vooVoltaISO}) anterior ao fim do programa (${p.fimProgramaISO}) — verificar.`,
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
  checarRemessaAntesDoD7,
  checarAlteracaoSemAceite,
  checarRepactuacaoSemAceite,
  checarDocumentoValidadeInsuficiente,
  checarCartaRecusaNaoRepassada,
  checarSeguroAusenteAntesEmbarque,
  checarSeguroVigenciaInsuficiente,
  checarSeguroCoberturaAbaixoMinimo,
  checarRequisitosConsulado,
  checarDocumentacaoInconsistente,
  checarPassagemDatasIncompativeis,
  checarPassagemCompraAntesVisto,
  checarPassagemVoltaAntesDoFim,
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
// `severidade` é opcional: a reconciliação pura não a usa (decide só por status);
// a camada de dados a carrega para dividir a resolução (ALTO aguarda ack humano).
export type AchadoPersistido = { chave: string; status: StatusAchado; severidade?: SeveridadeAchado };

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
