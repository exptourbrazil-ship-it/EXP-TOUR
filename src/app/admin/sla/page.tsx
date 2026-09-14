import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarPainelSLA, type LinhaSLA } from "@/lib/sla-painel";
import { ROTULO_STATUS_SLA, type StatusSLA } from "@/lib/sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel de SLA (cockpit "SLAs com alertas", doc 07): todas as exceções abertas
// do tenant com o prazo em DIAS ÚTEIS e o status, ordenadas por urgência. Cada
// linha leva ao Caso 360 (aba Ações). Escopo por tenant é feito na camada de
// dados; a autorização por capacidade é aqui.

const CHIP: Record<StatusSLA, { cor: string; bg: string }> = {
  vencido: { cor: "#b91c1c", bg: "#fde8e8" },
  vence_hoje: { cor: "#b45309", bg: "#fdf0d5" },
  no_prazo: { cor: "#15803d", bg: "#e7f4ea" },
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function textoPrazo(l: LinhaSLA): string {
  if (l.status === "vencido") {
    return l.atrasoDiasUteis > 0
      ? `estourou há ${l.atrasoDiasUteis} dia(s) útil(eis)`
      : "estourou";
  }
  if (l.status === "vence_hoje") return "vence hoje";
  return `faltam ${l.diasUteisRestantes} dia(s) útil(eis)`;
}

export default async function PainelSLAPage() {
  await exigirCapacidade("casos.ver", "/admin/sla");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const painel = await carregarPainelSLA(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-2xl text-brand">SLA · comunicações com prazo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Exceções abertas e seus prazos de atendimento em dias úteis. As mais urgentes primeiro.
      </p>

      <div className="mb-4 mt-4 flex flex-wrap gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">SLA estourado</div>
          <div className="text-xl font-semibold" style={{ color: "#b91c1c" }}>{painel.contadores.vencidos}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Vence hoje</div>
          <div className="text-xl font-semibold" style={{ color: "#b45309" }}>{painel.contadores.venceHoje}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">No prazo</div>
          <div className="text-xl font-semibold" style={{ color: "#15803d" }}>{painel.contadores.noPrazo}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Total aberto</div>
          <div className="text-xl font-semibold text-brand">{painel.contadores.total}</div>
        </div>
      </div>

      {painel.linhas.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          Nenhuma exceção aberta no momento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Processo</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Aberta em</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {painel.linhas.map((l) => {
                const chip = CHIP[l.status];
                return (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ color: chip.cor, background: chip.bg }}
                      >
                        {ROTULO_STATUS_SLA[l.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-800">{l.tipoLabel}</td>
                    <td className="px-3 py-2 text-neutral-800">{l.titularNome || "—"}</td>
                    <td className="px-3 py-2 capitalize text-neutral-600">{l.papelAlvo}</td>
                    <td className="px-3 py-2 text-neutral-600">{fmtData(l.abertaEmISO)}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {fmtData(l.prazoISO)}
                      <span className="ml-1 text-xs" style={{ color: chip.cor }}>
                        ({textoPrazo(l)})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/clientes/${l.titularId}?aba=acoes`}
                        className="text-sm font-medium text-brand-golddark underline"
                      >
                        Abrir caso
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
