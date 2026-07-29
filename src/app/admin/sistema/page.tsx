import { exigirAdmin } from "@/lib/admin-guard";
import { carregarSistema, JANELAS_REGUA } from "@/lib/admin-sistema";
import EventosProblematicos from "./EventosProblematicos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina de saude do sistema: eventos do barramento (com reprocessamento),
// atividade da regua de cobranca e NPS. A fila de eventos e um client
// component (carrega e age via API); o resumo e carregado no servidor.
export default async function AdminSistemaPage() {
  await exigirAdmin("/admin/sistema");

  let resumo = null as Awaited<ReturnType<typeof carregarSistema>> | null;
  try {
    resumo = await carregarSistema();
  } catch {
    resumo = null;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Sistema</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Saúde dos webhooks, régua de cobrança e satisfação (NPS).
        </p>
      </header>

      {/* Fila interativa de eventos a resolver */}
      <EventosProblematicos />

      {resumo ? (
        <>
          {/* Resumo de eventos por status */}
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold text-brand">Eventos (resumo)</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile rotulo="Pendentes" valor={resumo.eventos.pendente} tom={resumo.eventos.pendente > 0 ? "alerta" : undefined} />
              <Tile rotulo="Com erro" valor={resumo.eventos.erro} tom={resumo.eventos.erro > 0 ? "alerta" : undefined} />
              <Tile rotulo="Processados" valor={resumo.eventos.processado} />
              <Tile rotulo="Ignorados" valor={resumo.eventos.ignorado} />
            </div>
          </section>

          {/* Régua de cobrança */}
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold text-brand">Régua de cobrança</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile rotulo="Total enviados" valor={resumo.regua.total} />
              <Tile rotulo="Últimos 7 dias" valor={resumo.regua.ultimos7dias} />
              {JANELAS_REGUA.map((j) => (
                <Tile key={j} rotulo={j} valor={resumo!.regua.porJanela[j] ?? 0} />
              ))}
            </div>
          </section>

          {/* NPS */}
          <section className="mb-4">
            <h2 className="mb-3 text-sm font-semibold text-brand">NPS</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:col-span-1">
                <p className="text-xs font-medium text-neutral-500">Score</p>
                <p
                  className={`mt-2 font-serif text-3xl ${
                    resumo.nps.total === 0
                      ? "text-neutral-300"
                      : resumo.nps.score >= 0
                        ? "text-brand"
                        : "text-red-700"
                  }`}
                >
                  {resumo.nps.total === 0 ? "—" : resumo.nps.score}
                </p>
                <p className="mt-1 text-xs text-neutral-400">{resumo.nps.total} resposta(s)</p>
              </div>
              <Tile rotulo="Promotores" valor={resumo.nps.promotores} />
              <Tile rotulo="Neutros" valor={resumo.nps.neutros} />
              <Tile rotulo="Detratores" valor={resumo.nps.detratores} tom={resumo.nps.detratores > 0 ? "alerta" : undefined} />
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o resumo do sistema agora. A fila de eventos acima ainda
          funciona.
        </p>
      )}
    </div>
  );
}

function Tile({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom?: "alerta";
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 ${tom === "alerta" ? "border-red-200" : "border-neutral-200"}`}>
      <p className="text-xs font-medium text-neutral-500">{rotulo}</p>
      <p className={`mt-2 font-serif text-2xl ${tom === "alerta" ? "text-red-700" : "text-brand"}`}>
        {valor}
      </p>
    </div>
  );
}
