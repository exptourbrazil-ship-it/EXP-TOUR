// Motor PURO da trava de remessa da Entrada (Clausulas 2.5.2 / 8.4 / CDC art. 49):
// nao remeter dinheiro ao fornecedor enquanto o direito de arrependimento (7 dias
// do aceite) estiver correndo, SALVO se o cliente marcou "processamento imediato".
// A trava cai sozinha ao fim do prazo. Fonte da verdade da ENFORCEMENT: usada em
// executarRepasse (fail-closed); a UI so reflete.
//
// SEM imports: roda no runner nativo do Node. Determinista. O prazo de 7 dias
// espelha DIAS_ARREPENDIMENTO (termos.ts) — mantido inline para o motor ser puro.

export const DIAS_ARREPENDIMENTO_REMESSA = 7;

export type MotivoTrava =
  | "processamento_imediato" // cliente autorizou remessa imediata -> liberado
  | "arrependimento" // dentro dos 7 dias -> BLOQUEADO
  | "prazo_decorrido" // arrependimento ja passou -> liberado
  | "sem_aceite"; // sem ancora de data -> nao bloqueia (nao ha janela a computar)

export type TravaRemessa = {
  liberado: boolean;
  motivo: MotivoTrava;
  liberaEmISO: string | null; // instante em que a trava cai (fim do arrependimento)
};

export function prazoArrependimentoRemessaISO(aceiteISO: string): string {
  const base = new Date(aceiteISO).getTime();
  return new Date(base + DIAS_ARREPENDIMENTO_REMESSA * 24 * 60 * 60 * 1000).toISOString();
}

// ANCORA (aceiteISO): o inicio da janela de arrependimento e o instante do ACEITE
// do cliente. Nos contratos criados pelo checkout, converter_cotacao cria o
// contrato NA MESMA transacao do aceite -> contratos.created_at == aceite (correto).
// Contratos PROVISIONADOS pelo CRM (Zoho) antes do aceite teriam created_at cedo
// demais e liberariam a remessa antes da hora — por isso a fonte da ancora deve
// ser confirmada por fluxo de origem (ver nota ao mantenedor). Usar created_at por
// contrato e mais seguro que o ultimo aceite do titular (que sobre-travaria os
// contratos antigos de um titular multi-programa).
export function avaliarTravaRemessa(args: {
  aceiteISO: string | null; // ancora do arrependimento (created_at do contrato = aceite no checkout)
  agoraISO: string;
  processamentoImediato: boolean;
  // Carimbo GRAVADO 1x no aceite (contratos.data_fim_arrependimento). Quando
  // presente, e a FONTE DA VERDADE do fim da janela — congelada no aceite, nao
  // recomputada a cada leitura (CDC art. 49: prazo provavel e imutavel). Nos
  // contratos de checkout esse carimbo = created_at (== instante do aceite) + 7d;
  // o ganho e a IMUTABILIDADE/prova, nao uma ancora diferente do created_at.
  fimArrependimentoISO?: string | null;
}): TravaRemessa {
  // Excecao expressa do contrato: o cliente marcou processamento imediato.
  if (args.processamentoImediato) {
    return { liberado: true, motivo: "processamento_imediato", liberaEmISO: null };
  }
  // Fim da janela: prefere o carimbo gravado; so entao deriva do aceite (+7 dias).
  const carimbo = args.fimArrependimentoISO ? new Date(args.fimArrependimentoISO).getTime() : NaN;
  const liberaEmISO = Number.isFinite(carimbo)
    ? (args.fimArrependimentoISO as string)
    : args.aceiteISO && Number.isFinite(new Date(args.aceiteISO).getTime())
    ? prazoArrependimentoRemessaISO(args.aceiteISO)
    : null;
  // Sem carimbo nem ancora nao ha janela a computar -> nao trava (defensivo; nao
  // deve congelar a operacao).
  if (!liberaEmISO) {
    return { liberado: true, motivo: "sem_aceite", liberaEmISO: null };
  }
  // Fail-closed: um `agoraISO` improcessavel nao pode LIBERAR remessa (nao da para
  // afirmar que a janela passou). Sem carimbo/ancora ja caiu em "sem_aceite" acima;
  // com janela conhecida, so libera quando comprovadamente decorrida.
  const agora = new Date(args.agoraISO).getTime();
  if (!Number.isFinite(agora) || agora <= new Date(liberaEmISO).getTime()) {
    return { liberado: false, motivo: "arrependimento", liberaEmISO };
  }
  return { liberado: true, motivo: "prazo_decorrido", liberaEmISO };
}
