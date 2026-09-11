// Validacao de CPF — PURA e CLIENT-SAFE (sem rede/DB), para client components
// (ex.: checkout do orcamento). Espelha o validador de cadastro-service.ts (que
// e server-only e nao pode ser importado no client); ambos usam o mesmo algoritmo.

// Mantem so os digitos (remove pontuacao de CPF).
export function normalizarCpf(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

// Valida um CPF: 11 digitos, nao pode ser uma sequencia igual (000..., 111...)
// e os dois digitos verificadores tem que bater. Aceita mascarado ou normalizado.
export function validarCpf(cpf: unknown): boolean {
  const d = normalizarCpf(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calcDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  if (calcDigito(d.slice(0, 9), 10) !== Number(d[9])) return false;
  if (calcDigito(d.slice(0, 10), 11) !== Number(d[10])) return false;
  return true;
}

// Mascara visual: 000.000.000-00 (parcial enquanto digita).
export function mascararCpf(v: string): string {
  const d = normalizarCpf(v).slice(0, 11);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)].filter(Boolean);
  let out = p[0] || "";
  if (p[1]) out += "." + p[1];
  if (p[2]) out += "." + p[2];
  if (p[3]) out += "-" + p[3];
  return out;
}
