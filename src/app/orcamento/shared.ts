// Helpers compartilhados entre as telas do orcamento (busca e comparacao).
// Puros/client-safe (formatacao, datas, encode/decode dos parametros da URL).

export function fmtMoeda(v: number, cur: string): string {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: cur, maximumFractionDigits: 0 });
  } catch {
    return `${cur} ${Math.round(v).toLocaleString("pt-BR")}`;
  }
}
export const fmtBRL = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

export function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
export function labelSemanas(w: number): string {
  return w === 1 ? "1 semana" : `${w} semanas`;
}

// Segundas-feiras entre hoje e o fim de 2027; feriado fixo (1 jan, 25/26 dez) -> terca.
export function segundasDisponiveis(): string[] {
  const out: string[] = [];
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const fim = new Date(Date.UTC(2027, 11, 31));
  while (d <= fim) {
    const mes = d.getUTCMonth() + 1, dia = d.getUTCDate();
    const feriado = (mes === 1 && dia === 1) || (mes === 12 && (dia === 25 || dia === 26));
    const escolhido = new Date(d);
    if (feriado) escolhido.setUTCDate(escolhido.getUTCDate() + 1);
    out.push(escolhido.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Meses de inicio para o SLIDER da tela "Seu orcamento": do proximo mes ate
// dez/2028. label pt-BR ("julho de 2027"); fimISO = ultimo dia do mes (base do N).
export type MesInicio = { key: string; label: string; primeiroISO: string; fimISO: string; ano: number };
export function mesesInicioDisponiveis(): MesInicio[] {
  const out: MesInicio[] = [];
  const hoje = new Date();
  let d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 1)); // proximo mes
  const fim = new Date(Date.UTC(2028, 11, 1));
  while (d <= fim) {
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth(); // 0-indexed
    const primeiro = d.toISOString().slice(0, 10);
    const fimMes = new Date(Date.UTC(yy, mm + 1, 0)).toISOString().slice(0, 10);
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ key: `${yy}-${String(mm + 1).padStart(2, "0")}`, label, primeiroISO: primeiro, fimISO: fimMes, ano: yy });
    d = new Date(Date.UTC(yy, mm + 1, 1));
  }
  return out;
}

// Parametros do orcamento que viajam na URL (tela 1 -> tela 2/compartilhar).
export type ParamsOrcamento = {
  ids: string[];
  weeks: number;
  inicio: string; // YYYY-MM-DD
  accom: boolean;
  accomTipo: "residence" | "homestay";
  seguro: boolean;
};

export function encodeParams(p: ParamsOrcamento): string {
  const sp = new URLSearchParams();
  sp.set("ids", p.ids.join(","));
  sp.set("weeks", String(p.weeks));
  sp.set("inicio", p.inicio);
  sp.set("accom", p.accom ? (p.accomTipo === "residence" ? "res" : "casa") : "0");
  sp.set("seguro", p.seguro ? "1" : "0");
  return sp.toString();
}

export function decodeParams(sp: URLSearchParams): ParamsOrcamento {
  const accomRaw = sp.get("accom") || "casa";
  return {
    ids: (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean),
    weeks: Math.max(1, parseInt(sp.get("weeks") || "4") || 4),
    inicio: sp.get("inicio") || new Date().toISOString().slice(0, 10),
    accom: accomRaw !== "0",
    accomTipo: accomRaw === "res" ? "residence" : "homestay",
    seguro: (sp.get("seguro") || "1") !== "0",
  };
}
