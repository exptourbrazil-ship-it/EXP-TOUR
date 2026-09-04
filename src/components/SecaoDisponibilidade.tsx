import Link from "next/link";
import type { IntakeDoProduto } from "@/lib/produto-admin-service";

// Seção "Datas & Disponibilidade" da página unificada de produto. Presentacional
// (só leitura): lista as datas de início (programa) ou as janelas (acomodação)
// deste produto e leva ao editor de disponibilidade para gerir. Kinds sem
// calendário próprio (seguro/complementar/pacote) mostram um aviso.

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto", limited: "Limitado", closed: "Fechado", waitlist: "Lista de espera", on_request: "Sob consulta",
};
const STATUS_COR: Record<string, string> = {
  open: "text-green-700", limited: "text-amber-700", closed: "text-red-700",
  waitlist: "text-neutral-500", on_request: "text-neutral-500",
};

function fmtData(d: string | null): string {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return dia ? `${dia}/${m}/${a}` : d;
}

const COM_CALENDARIO = new Set(["program", "accommodation"]);

export default function SecaoDisponibilidade({
  kind,
  supplierId,
  intakes,
}: {
  kind: string;
  supplierId: string | null;
  intakes: IntakeDoProduto[];
}) {
  const ehAcomodacao = kind === "accommodation";

  if (!COM_CALENDARIO.has(kind)) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        Este tipo de produto não tem calendário de datas próprio. Disponibilidade se aplica a programas
        (datas de início) e acomodações (janelas de período).
      </p>
    );
  }

  const linkEditor = supplierId ? `/admin/disponibilidade?supplier=${supplierId}` : "/admin/disponibilidade";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg text-brand">{ehAcomodacao ? "Janelas de período" : "Datas de início"}</h2>
          <p className="text-xs text-neutral-500">
            {ehAcomodacao ? "Períodos de disponibilidade desta acomodação." : "Datas de início (intakes) deste programa."}
          </p>
        </div>
        <Link href={linkEditor} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          Gerenciar datas →
        </Link>
      </div>

      {intakes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          Nenhuma {ehAcomodacao ? "janela" : "data"} cadastrada. Use o editor de disponibilidade para adicionar.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">{ehAcomodacao ? "Período" : "Data de início"}</th>
                <th className="px-4 py-2">Status</th>
                {!ehAcomodacao ? <th className="px-4 py-2">Vagas</th> : null}
                <th className="px-4 py-2">Observação</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {intakes.map((i) => (
                <tr key={i.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">
                    {fmtData(i.startDate)}
                    {ehAcomodacao ? ` → ${i.endDate ? fmtData(i.endDate) : "em diante"}` : ""}
                  </td>
                  <td className={`px-4 py-2 font-medium ${STATUS_COR[i.status] ?? "text-neutral-600"}`}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </td>
                  {!ehAcomodacao ? (
                    <td className="px-4 py-2 text-neutral-500">{i.capacity != null ? i.capacity : "—"}</td>
                  ) : null}
                  <td className="px-4 py-2 text-neutral-500">{i.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
