// Helper puro da "linha do tempo" (jornada) exibida na aba Início. Deriva o
// estado de cada etapa de sinais REAIS do cliente (contrato, documentos,
// parcelas, data de início) — sem progresso fictício. Onde não há sinal
// confiável (ex.: conclusão do programa), a etapa permanece "pendente".
// Sem dependência de rede/DB, testável com o runner nativo do Node.

export type EstadoEtapa = "concluida" | "andamento" | "pendente";

export type EtapaJornada = {
  nome: string;
  descricao: string;
  estado: EstadoEtapa;
};

export function calcularJornada(params: {
  temContrato: boolean;
  documentosEnviados: number;
  parcelasPagas: number;
  parcelasTotal: number;
  diasAteInicio: number | null;
}): EtapaJornada[] {
  const { temContrato, documentosEnviados, parcelasPagas, parcelasTotal, diasAteInicio } = params;

  const docsOk = documentosEnviados > 0;
  const pagamentosOk = parcelasTotal > 0 && parcelasPagas >= parcelasTotal;
  const pagamentosAndamento = parcelasPagas > 0 && !pagamentosOk;
  const jaComecou = diasAteInicio !== null && diasAteInicio <= 0;
  const embarqueProximo = diasAteInicio !== null && diasAteInicio > 0 && diasAteInicio <= 30;

  return [
    {
      nome: "Contrato",
      descricao: temContrato ? "Seu contrato está ativo na EXP Tour." : "Aguardando a ativação do contrato.",
      estado: temContrato ? "concluida" : "pendente",
    },
    {
      nome: "Documentos",
      descricao: docsOk
        ? documentosEnviados + " documento(s) no seu cofre."
        : "Envie seus documentos na aba Documentos.",
      estado: docsOk ? "concluida" : temContrato ? "andamento" : "pendente",
    },
    {
      nome: "Pagamentos",
      descricao:
        parcelasTotal > 0
          ? parcelasPagas + " de " + parcelasTotal + " parcelas pagas."
          : "Acompanhe suas parcelas na aba Financeiro.",
      estado: pagamentosOk ? "concluida" : pagamentosAndamento ? "andamento" : "pendente",
    },
    {
      nome: "Pré-embarque",
      descricao: jaComecou
        ? "Tudo pronto — sua viagem começou."
        : embarqueProximo
        ? "Reta final: confira o checklist na aba Embarque."
        : "Prepare-se com o checklist na aba Embarque.",
      estado: jaComecou ? "concluida" : embarqueProximo ? "andamento" : "pendente",
    },
    {
      nome: "Durante a viagem",
      descricao: jaComecou ? "Aproveite! Seus contatos de apoio estão na aba Viagem." : "Apoio no destino na aba Viagem.",
      estado: jaComecou ? "andamento" : "pendente",
    },
    {
      nome: "Retorno",
      descricao: "Certificado e avaliação ficam na aba Retorno.",
      estado: "pendente",
    },
  ];
}

// Índice da primeira etapa ainda não concluída (a "atual"). Se todas
// concluídas, retorna o total (nenhuma em aberto).
export function indiceEtapaAtual(etapas: EtapaJornada[]): number {
  const i = etapas.findIndex((e) => e.estado !== "concluida");
  return i === -1 ? etapas.length : i;
}

export function totalConcluidas(etapas: EtapaJornada[]): number {
  return etapas.filter((e) => e.estado === "concluida").length;
}
