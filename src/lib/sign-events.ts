// Helpers PUROS (sem rede/DB) do fluxo Zoho Sign, testaveis sem mocks.
// Espelham o papel do mp-events.ts para o Mercado Pago.
//
// NB sobre o payload: a forma exata do webhook do Zoho Sign deve ser
// confirmada contra a documentacao/um disparo real. `extrairEventoSign` e
// deliberadamente tolerante (procura o id/status em varios locais comuns) para
// nao quebrar com pequenas variacoes; ajuste os campos quando virmos o payload
// real.

export type StatusAssinatura =
  | "assinado"
  | "recusado"
  | "expirado"
  | "em_andamento"
  | "desconhecido";

export type EventoSign = {
  envelopeId: string; // request_id do Zoho Sign
  statusRaw: string; // status cru vindo do Zoho
  status: StatusAssinatura; // status normalizado
};

// Normaliza o status cru do Zoho Sign para o nosso vocabulario.
export function mapearStatusSign(raw: string | null | undefined): StatusAssinatura {
  const s = (raw || "").toLowerCase();
  if (s === "completed" || s === "signed" || s === "complete") return "assinado";
  if (s === "declined" || s === "rejected") return "recusado";
  if (s === "expired") return "expirado";
  if (s === "inprogress" || s === "in progress" || s === "sent" || s === "pending") return "em_andamento";
  return "desconhecido";
}

// Extrai { envelopeId, status } do corpo do webhook do Zoho Sign. Retorna null
// se nao houver um id de request identificavel.
export function extrairEventoSign(payload: any): EventoSign | null {
  const req = payload?.requests || payload?.request || payload?.data || payload || {};
  const envelopeId =
    req.request_id ?? req.requestId ?? payload?.request_id ?? payload?.requestId ?? null;
  if (!envelopeId) return null;

  const statusRaw = String(req.request_status ?? req.status ?? payload?.request_status ?? "");
  return {
    envelopeId: String(envelopeId),
    statusRaw,
    status: mapearStatusSign(statusRaw),
  };
}

export type PessoaContrato = {
  nome: string | null;
  email: string | null;
};

export type Signatario = {
  papel: "pagante" | "estudante";
  nome: string;
  email: string;
  ordem: number;
};

// Regra multi-signatario por idade:
//  - o PAGANTE (contratante) sempre assina;
//  - o ESTUDANTE assina apenas se for MAIOR de idade (parte do contrato);
//    se for menor, quem responde e o pagante (responsavel legal), entao o
//    estudante nao entra como signatario.
// Signatarios sem e-mail sao descartados (o Zoho Sign exige e-mail).
// Regra de produto — confirmar com o juridico; centralizada aqui de proposito.
export function montarSignatarios(opts: {
  pagante: PessoaContrato;
  estudante?: PessoaContrato | null;
  estudanteEhMenor?: boolean;
}): Signatario[] {
  const { pagante, estudante, estudanteEhMenor } = opts;
  const lista: Signatario[] = [];

  if (pagante?.email && pagante.email.trim()) {
    lista.push({
      papel: "pagante",
      nome: (pagante.nome || "").trim() || "Contratante",
      email: pagante.email.trim(),
      ordem: 1,
    });
  }

  if (estudante && !estudanteEhMenor && estudante.email && estudante.email.trim()) {
    // Evita duplicar quando pagante e estudante sao a mesma pessoa (mesmo e-mail).
    const jaIncluso = lista.some(
      (s) => s.email.toLowerCase() === estudante.email!.trim().toLowerCase()
    );
    if (!jaIncluso) {
      lista.push({
        papel: "estudante",
        nome: (estudante.nome || "").trim() || "Estudante",
        email: estudante.email.trim(),
        ordem: lista.length + 1,
      });
    }
  }

  return lista;
}

// Idade em anos completos na data `hojeISO`. Sem data de nascimento, assume
// MENOR (conservador): na dúvida, só o pagante/responsável assina — evita
// mandar pedido de assinatura a um possível menor. Datas YYYY-MM-DD.
export function ehMenorDeIdade(
  dataNascISO: string | null | undefined,
  hojeISO: string
): boolean {
  if (!dataNascISO || dataNascISO.length < 10) return true;
  const [ny, nm, nd] = dataNascISO.slice(0, 10).split("-").map(Number);
  const [hy, hm, hd] = hojeISO.slice(0, 10).split("-").map(Number);
  let idade = hy - ny;
  if (hm < nm || (hm === nm && hd < nd)) idade -= 1;
  return idade < 18;
}
