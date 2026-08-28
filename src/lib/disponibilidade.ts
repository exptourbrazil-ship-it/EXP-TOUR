// Helpers PUROS da Disponibilidade (Portal do Fornecedor / admin). Sem rede/DB:
// validam e normalizam o payload dos programas e dos intakes (datas + status +
// capacidade) antes de gravar. Testados em disponibilidade.test.ts.

// Status de um intake (data de inicio de um programa). Espelha o CHECK do banco.
export const STATUS_INTAKE = ["open", "limited", "closed", "waitlist"] as const;
export type StatusIntake = (typeof STATUS_INTAKE)[number];

// Rotulos PT (UI). O valor no banco e o slug em ingles.
export const STATUS_INTAKE_LABEL: Record<StatusIntake, string> = {
  open: "Aberto",
  limited: "Poucas vagas",
  closed: "Fechado",
  waitlist: "Lista de espera",
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Data no formato YYYY-MM-DD (a coluna e `date`). Nao aceita data parcial.
export function dataIsoValida(v: unknown): boolean {
  const s = texto(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type IntakeEntrada = {
  startDate?: unknown;
  status?: unknown;
  capacity?: unknown;
  notes?: unknown;
};
export type IntakeDados = {
  startDate: string;
  status: StatusIntake;
  capacity: number | null;
  notes: string | null;
};
export type ResultadoIntake = { ok: true; dados: IntakeDados } | { ok: false; erro: string };

// Valida/normaliza um intake. Regras:
//  - startDate obrigatorio e valido (YYYY-MM-DD);
//  - status: vazio -> 'open'; senao precisa ser um status conhecido;
//  - capacity: vazio -> null; senao inteiro >= 0;
//  - notes: texto opcional (limitado).
export function validarIntake(e: IntakeEntrada): ResultadoIntake {
  const startDate = texto(e.startDate);
  if (!dataIsoValida(startDate)) return { ok: false, erro: "Informe uma data de início válida (AAAA-MM-DD)." };

  const statusRaw = texto(e.status);
  const status = (statusRaw || "open") as StatusIntake;
  if (!(STATUS_INTAKE as readonly string[]).includes(status)) {
    return { ok: false, erro: "Status inválido." };
  }

  let capacity: number | null = null;
  if (e.capacity !== null && e.capacity !== undefined && texto(e.capacity) !== "") {
    const n = Number(e.capacity);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      return { ok: false, erro: "Capacidade deve ser um inteiro entre 0 e 100000." };
    }
    capacity = n;
  }

  const notes = texto(e.notes).slice(0, 500) || null;
  return { ok: true, dados: { startDate, status, capacity, notes } };
}

export type ProgramaEntrada = {
  name?: unknown;
  language?: unknown;
  educationType?: unknown;
  minDuration?: unknown;
  maxDuration?: unknown;
};
export type ProgramaDados = {
  name: string;
  language: string | null;
  educationType: string | null;
  minDuration: number | null;
  maxDuration: number | null;
};
export type ResultadoPrograma = { ok: true; dados: ProgramaDados } | { ok: false; erro: string };

function inteiroPositivoOuNulo(v: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (v === null || v === undefined || texto(v) === "") return { ok: true, valor: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, valor: n };
}

// Valida/normaliza um programa (product kind=program self-service da escola).
export function validarPrograma(e: ProgramaEntrada): ResultadoPrograma {
  const name = texto(e.name);
  if (!name) return { ok: false, erro: "Informe o nome do programa." };

  const min = inteiroPositivoOuNulo(e.minDuration);
  const max = inteiroPositivoOuNulo(e.maxDuration);
  if (!min.ok || !max.ok) return { ok: false, erro: "Duração deve ser um inteiro positivo." };
  if (min.valor != null && max.valor != null && max.valor < min.valor) {
    return { ok: false, erro: "Duração máxima não pode ser menor que a mínima." };
  }

  return {
    ok: true,
    dados: {
      name: name.slice(0, 200),
      language: texto(e.language).slice(0, 60) || null,
      educationType: texto(e.educationType).slice(0, 60) || null,
      minDuration: min.valor,
      maxDuration: max.valor,
    },
  };
}
