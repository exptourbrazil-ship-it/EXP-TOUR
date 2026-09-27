// Helpers PUROS (sem rede/DB) de dados bancarios do fornecedor — tipos e
// validacao da entrada de uma proposta de conta (destino do repasse). Extraido
// de supplier-bank-service.ts para poder ser testado sem mocks (o service usa
// "@/lib/admin-audit", que so resolve dentro do Next; este modulo nao importa
// nada alem de si mesmo).
export type StatusContaBancaria = "pending_admin" | "confirmed" | "rejected" | "superseded";

export type ContaBancariaFornecedor = {
  id: string;
  tenantId: string;
  supplierId: string;
  status: StatusContaBancaria;
  accountHolderName: string;
  bankName: string | null;
  countryCode: string | null;
  currency: string | null;
  iban: string | null;
  swiftBic: string | null;
  accountNumber: string | null;
  routingCode: string | null;
  pixKey: string | null;
  proposedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  supplierNome?: string | null;
};

export type Falha = { campo: string; erro: string };

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

// Valida a ENTRADA da proposta (fornecedor ou ajuste do admin). Falha fechada:
// exige nome do titular e ao menos UM identificador de conta utilizavel — o
// mesmo minimo que a constraint do banco garante, checado aqui ANTES de
// escrever para devolver um erro de campo legivel (a constraint e o cinto de
// seguranca, nao a primeira linha de defesa).
export function validarEntradaContaBancaria(entrada: unknown): { ok: true; valor: Record<string, unknown> } | { ok: false; falhas: Falha[] } {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const falhas: Falha[] = [];

  const accountHolderName = trimOrNull(e.accountHolderName);
  if (!accountHolderName) falhas.push({ campo: "accountHolderName", erro: "Informe o nome do titular da conta." });

  const bankName = trimOrNull(e.bankName);
  const countryCode = trimOrNull(e.countryCode)?.toUpperCase().slice(0, 2) ?? null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) falhas.push({ campo: "countryCode", erro: "País inválido (use o código de 2 letras, ex.: BR, US)." });
  const currency = trimOrNull(e.currency)?.toUpperCase().slice(0, 3) ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) falhas.push({ campo: "currency", erro: "Moeda inválida (use o código de 3 letras, ex.: BRL, USD)." });

  const iban = trimOrNull(e.iban);
  const swiftBic = trimOrNull(e.swiftBic);
  const accountNumber = trimOrNull(e.accountNumber);
  const routingCode = trimOrNull(e.routingCode);
  const pixKey = trimOrNull(e.pixKey);
  const notes = trimOrNull(e.notes);
  if (notes && notes.length > 1000) falhas.push({ campo: "notes", erro: "Observação muito longa (máx. 1000 caracteres)." });

  const temIdentificador = !!iban || !!pixKey || (!!accountNumber && !!routingCode);
  if (!temIdentificador) {
    falhas.push({
      campo: "identificador",
      erro: "Informe ao menos um identificador de conta: IBAN, ou conta + agência/routing, ou chave Pix.",
    });
  }

  if (falhas.length > 0) return { ok: false, falhas };
  return {
    ok: true,
    valor: {
      account_holder_name: accountHolderName,
      bank_name: bankName,
      country_code: countryCode,
      currency,
      iban,
      swift_bic: swiftBic,
      account_number: accountNumber,
      routing_code: routingCode,
      pix_key: pixKey,
      notes,
    },
  };
}
