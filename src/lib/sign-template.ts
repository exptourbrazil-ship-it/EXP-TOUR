// Configuracao do template de contrato no Zoho Sign. Os IDs vem do ambiente
// (Vercel) para nao precisar mexer em codigo quando o template for criado:
//   - ZOHO_SIGN_TEMPLATE_ID: id do template
//   - ZOHO_SIGN_ACTION_CONTRATANTE: action_id do papel "Contratante" (pagante)
//   - ZOHO_SIGN_ACTION_ESTUDANTE:  action_id do papel "Estudante" (opcional)
//
// O UNICO ponto que talvez precise de ajuste no codigo e o mapeamento dos
// campos de merge (montarCamposTemplate): as CHAVES a esquerda devem casar com
// os nomes dos campos definidos no template do Zoho Sign.

export const SIGN_TEMPLATE_ID = process.env.ZOHO_SIGN_TEMPLATE_ID || "";
export const SIGN_ACTION_CONTRATANTE = process.env.ZOHO_SIGN_ACTION_CONTRATANTE || "";
export const SIGN_ACTION_ESTUDANTE = process.env.ZOHO_SIGN_ACTION_ESTUDANTE || "";

// Config minima para enviar: precisa do template e do papel do contratante.
export function signTemplateConfigurado(): boolean {
  return Boolean(SIGN_TEMPLATE_ID && SIGN_ACTION_CONTRATANTE);
}

export type DadosContratoParaMerge = {
  titularNome: string | null;
  titularCpf: string | null;
  titularEmail: string | null;
  programaNome: string | null;
  valorTotal: number | string | null;
  moeda: string | null;
  destino: string | null;
  estudanteNome: string | null;
};

// Monta os valores de merge. AJUSTAR as chaves (nomes dos campos) aos nomes
// reais criados no template do Zoho Sign.
export function montarCamposTemplate(d: DadosContratoParaMerge): Record<string, string> {
  return {
    titular_nome: d.titularNome || "",
    titular_cpf: d.titularCpf || "",
    titular_email: d.titularEmail || "",
    programa_nome: d.programaNome || "",
    programa_valor: d.valorTotal != null ? String(d.valorTotal) : "",
    programa_moeda: d.moeda || "",
    destino: d.destino || "",
    estudante_nome: d.estudanteNome || "",
  };
}
