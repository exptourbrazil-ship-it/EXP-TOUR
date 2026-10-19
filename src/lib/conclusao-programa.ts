// Motor PURO da conclusão automática do programa na data de término
// (contratos.data_fim). Sem rede/DB — testável com o runner nativo do Node.
//
// Regra: quando a data de término + uma folga configurável já passou, o contrato
// é elegível para virar "concluido" — DESDE QUE já esteja na fase de execução
// (em_programa/retorno). Propostas que nunca iniciaram (sem entrada, sem início)
// têm data de término no CRM mas não devem ser "concluídas" nem gerar pedido de
// certificado à escola. A decisão de QUEM concluir é pura aqui; o efeito
// (transição + e-mail à escola) fica no serviço/cron.
// Import relativo (não "@/..."): o runner de testes (node --test) não resolve o
// alias de caminho, e contrato-estados é um motor puro no mesmo diretório.
import { estadoValido, rankEstado } from "./contrato-estados.ts";

// Rank mínimo para conclusão automática: só contratos que de fato entraram em
// execução (o estudante embarcou). Deriva do motor de estados, não hardcoded.
const RANK_MIN_EXECUCAO = rankEstado("em_programa") as number; // 7

export type CandidatoConclusao = {
  dataFimISO: string | null; // contratos.data_fim (AAAA-MM-DD)
  estado: string | null; // estado atual (persistido ou derivado)
  canceladoEm: string | null; // contratos.cancelado_em
};

// Soma dias a uma data AAAA-MM-DD, em UTC puro (sem fuso). Retorna AAAA-MM-DD ou
// null para entrada inválida.
export function adicionarDiasISO(iso: string, dias: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
}

// Estados que NÃO devem ser concluídos automaticamente (já encerrados ou fora da
// linha). Espelha os terminais da máquina de estados.
export const ESTADOS_NAO_CONCLUIR = new Set<string>([
  "concluido",
  "cancelado",
  "proposta_expirada",
]);

// Elegível quando: tem data de término, não está cancelado, está num estado de
// EXECUÇÃO conhecido (em_programa/retorno — rank >= em_programa) e não terminal, e
// (data_fim + folga) já alcançou hoje. Estado ausente/desconhecido ou anterior à
// execução (proposta, matrícula, visto…) NÃO é elegível: a conclusão automática
// não inventa que um programa aconteceu. Esses casos ficam para o botão manual
// "Concluir" do admin. Comparação lexicográfica de AAAA-MM-DD (mesmo formato).
export function elegivelParaConclusao(
  c: CandidatoConclusao,
  hojeISO: string,
  folgaDias: number,
): boolean {
  const dataFim = (c.dataFimISO ?? "").slice(0, 10);
  if (!dataFim) return false;
  if (c.canceladoEm) return false;
  if (!c.estado || !estadoValido(c.estado)) return false; // estado desconhecido -> não conclui
  if (ESTADOS_NAO_CONCLUIR.has(c.estado)) return false;
  const rank = rankEstado(c.estado);
  if (rank == null || rank < RANK_MIN_EXECUCAO) return false; // só a fase de execução
  const limite = adicionarDiasISO(dataFim, Math.max(0, Math.round(folgaDias)));
  if (!limite) return false;
  return limite <= hojeISO;
}

const FOLGA_CONCLUSAO_PADRAO = 3;

// Dias de folga após o término antes de concluir. Parâmetro por instância (env),
// nunca hardcoded no fluxo. Default 3.
export function folgaConclusaoDias(): number {
  const env = Number(process.env.CONCLUSAO_FOLGA_DIAS);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : FOLGA_CONCLUSAO_PADRAO;
}

// Conteúdo do e-mail à escola pedindo o certificado (imagem) e o report final,
// no idioma do contato (en/pt). Puro: só monta strings. `estudante`/`programa`
// vão no corpo do e-mail (não em log).
export function conteudoPedidoCertificado(
  idioma: string,
  d: { estudante: string; programa: string; dataFimBR: string },
): { subject: string; titulo: string; contexto: string; botaoLabel: string } {
  const pt = idioma === "pt";
  if (pt) {
    return {
      subject: `Certificado e relatório — ${d.estudante}`,
      titulo: "Programa concluído — enviar certificado e relatório acadêmico",
      contexto:
        `O programa de ${d.estudante}${d.programa ? ` (${d.programa})` : ""} foi encerrado em ${d.dataFimBR}. ` +
        "Por favor, envie o certificado de conclusão e o relatório acadêmico final do estudante pelo portal (botão abaixo).",
      botaoLabel: "Enviar documentos",
    };
  }
  return {
    subject: `Certificate & report — ${d.estudante}`,
    titulo: "Program completed — please share the certificate & academic report",
    contexto:
      `The program for ${d.estudante}${d.programa ? ` (${d.programa})` : ""} ended on ${d.dataFimBR}. ` +
      "Please upload the completion certificate and the student's final academic report via the portal (button below).",
    botaoLabel: "Upload documents",
  };
}

const AVISO_FIM_JANELA_PADRAO = 3;

// Janela (em dias) após a conclusão em que o aluno ainda recebe o aviso de fim de
// programa. Evita disparo RETROATIVO a ex-alunos antigos: só conclusões recentes
// (dentro da janela) geram o convite ao /retorno. Parâmetro por instância (env).
export function avisoFimJanelaDias(): number {
  const env = Number(process.env.AVISO_FIM_JANELA_DIAS);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : AVISO_FIM_JANELA_PADRAO;
}

// Conteúdo (PT) do e-mail ao ALUNO quando o intercâmbio termina, convidando-o à
// aba /retorno (certificado, avaliação no Google, nota ao serviço, indicação).
// Puro: só monta strings. `nome`/`programa` vão no corpo do e-mail (não em log).
export function conteudoAvisoFimAluno(
  d: { nome: string; programa: string },
): { subject: string; titulo: string; paragrafo: string; botaoLabel: string } {
  const primeiro = (d.nome || "").trim().split(/\s+/)[0] || "";
  const prog = d.programa ? ` ${d.programa}` : "";
  return {
    subject: "Seu intercâmbio chegou ao fim 🎓",
    titulo: primeiro ? `Olá, ${primeiro}!` : "Olá!",
    paragrafo:
      `Seu programa${prog} chegou ao fim — parabéns pela conquista! 🎉 ` +
      "Na sua Área do Cliente, na aba Retorno, você fecha essa jornada: baixa o certificado de " +
      "conclusão (assim que a escola enviar), deixa sua avaliação no Google sobre o atendimento e " +
      "uma nota ao serviço, e ainda pode indicar um amigo.",
    botaoLabel: "Acessar minha Área",
  };
}
