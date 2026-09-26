// Lógica pura (sem JSX) de edição da grade de horários (program_detail.timetable).
// Compartilhada entre o editor do admin (src/components/ProdutoEditor.tsx) e o
// editor do fornecedor (src/app/fornecedor/(portal)/conteudo/[productId]/ConteudoProgramaEditor.tsx),
// que têm sistemas de estilo diferentes (Tailwind vs. tokens --p-*) e por isso
// mantêm cada um seu próprio componente de UI, mas usam o mesmo shape/parsing.
// Ver também o parser tolerante (leitura) em src/lib/produto-conteudo.ts.

export const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];
export type BlocoAulaEdit = { inicio: string; fim: string; descricao: string; isIntervalo: boolean };
export type TimetableEdit = Record<DiaSemana, BlocoAulaEdit[]>;

export function timetableVazio(): TimetableEdit {
  const t = {} as TimetableEdit;
  for (const d of DIAS_SEMANA) t[d] = [];
  return t;
}

// Hidrata o estado da UI a partir do jsonb salvo (shape novo OU o antigo, objeto
// { "Segunda": ["08:30-10:10", ...] }). Tolerante: entrada desconhecida vira
// grade vazia em vez de quebrar a tela.
export function hidratarTimetable(raw: unknown): TimetableEdit {
  const out = timetableVazio();
  const diaParaSigla: Record<string, DiaSemana> = {
    segunda: "Seg", "segunda-feira": "Seg", monday: "Seg", seg: "Seg",
    terça: "Ter", terca: "Ter", "terça-feira": "Ter", tuesday: "Ter", ter: "Ter",
    quarta: "Qua", "quarta-feira": "Qua", wednesday: "Qua", qua: "Qua",
    quinta: "Qui", "quinta-feira": "Qui", thursday: "Qui", qui: "Qui",
    sexta: "Sex", "sexta-feira": "Sex", friday: "Sex", sex: "Sex",
    sábado: "Sáb", sabado: "Sáb", saturday: "Sáb", sab: "Sáb", sáb: "Sáb",
    domingo: "Dom", sunday: "Dom", dom: "Dom",
  };
  const siglaDe = (dia: string): DiaSemana | null => {
    const k = dia.trim().toLowerCase();
    if ((DIAS_SEMANA as readonly string[]).includes(dia.trim() as DiaSemana)) return dia.trim() as DiaSemana;
    return diaParaSigla[k] ?? null;
  };
  const parseBlocoStr = (s: string): BlocoAulaEdit => {
    const m = s.trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*(.*)$/);
    if (m) return { inicio: m[1], fim: m[2], descricao: m[3].trim() || "Aula", isIntervalo: false };
    return { inicio: "", fim: "", descricao: s.trim(), isIntervalo: false };
  };
  const parseBlocoObj = (x: any): BlocoAulaEdit | null => {
    if (typeof x === "string") return x.trim() ? parseBlocoStr(x) : null;
    if (x && typeof x === "object") {
      const inicio = String(x.inicio ?? x.start ?? "").trim();
      const fim = String(x.fim ?? x.end ?? "").trim();
      const descricao = String(x.descricao ?? x.description ?? x.nome ?? "").trim();
      if (!inicio && !fim && !descricao) return null;
      return { inicio, fim, descricao, isIntervalo: !!x.isIntervalo };
    }
    return null;
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const dia = siglaDe(String((item as any).dia ?? (item as any).day ?? ""));
      if (!dia) continue;
      const blocosRaw = Array.isArray((item as any).blocos ?? (item as any).slots ?? (item as any).horarios)
        ? ((item as any).blocos ?? (item as any).slots ?? (item as any).horarios)
        : [];
      out[dia] = blocosRaw.map(parseBlocoObj).filter((b: BlocoAulaEdit | null): b is BlocoAulaEdit => b !== null);
    }
  } else if (raw && typeof raw === "object") {
    for (const [diaRaw, v] of Object.entries(raw as Record<string, unknown>)) {
      const dia = siglaDe(diaRaw);
      if (!dia || !Array.isArray(v)) continue;
      out[dia] = v.map(parseBlocoObj).filter((b: BlocoAulaEdit | null): b is BlocoAulaEdit => b !== null);
    }
  }
  return out;
}

// Serializa para o shape canônico (array de dias) — só entra no payload de
// salvar quando houver ao menos um bloco em algum dia.
export function serializarTimetable(t: TimetableEdit): Array<{ dia: string; blocos: BlocoAulaEdit[] }> | undefined {
  const dias = DIAS_SEMANA
    .map((d) => ({ dia: d, blocos: t[d].filter((b) => b.inicio || b.fim || b.descricao.trim()) }))
    .filter((d) => d.blocos.length > 0);
  return dias.length ? dias : undefined;
}
