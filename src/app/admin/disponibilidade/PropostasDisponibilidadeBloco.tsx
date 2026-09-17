import Link from "next/link";
import type { PropostaDisponibilidadeResumo } from "@/lib/disponibilidade-proposta-service";

// Bloco "Propostas lidas por IA" (F3.4) nas telas de disponibilidade (admin e hub).
export default function PropostasDisponibilidadeBloco({ propostas, mostrarFornecedor = true }: { propostas: PropostaDisponibilidadeResumo[]; mostrarFornecedor?: boolean }) {
  if (propostas.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-serif text-base text-brand">Datas lidas por IA</h2>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{propostas.length}</span>
      </div>
      <p className="mb-3 text-xs text-neutral-600">
        Datas de início e janelas encontradas em materiais (calendário, price list ou brochura), já comparadas com o publicado. Nada muda até você revisar e <strong>publicar</strong>.
      </p>
      <ul className="divide-y divide-blue-100">
        {propostas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-brand">
                {mostrarFornecedor && p.supplierNome ? `${p.supplierNome} · ` : ""}
                {p.sourceFilename || "material"}
                {p.status === "processing" ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">em processamento</span> : null}
                {p.avisos.length > 0 ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title={p.avisos.join(" · ")}>
                    {p.avisos.length} aviso{p.avisos.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-500">
                {p.itens} data(s) · {p.criar} nova(s) · {p.alterar} alteração(ões) de status
              </div>
            </div>
            <Link href={`/admin/disponibilidade/propostas/${p.id}`} className="text-brand-golddark hover:underline">
              Revisar →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
