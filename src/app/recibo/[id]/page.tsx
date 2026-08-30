import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarRecibo } from "@/lib/recibo-service";
import ImprimirBotao from "@/app/contrato/[id]/ImprimirBotao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recibo itemizado na Area do Cliente (Clausula 6.5.2): PTAX+data, Taxa de
// Intermediacao (5%), IOF, total pago, valor amortizado e saldo remanescente.
// Escopado por POSSE (o pagamento tem de ser de contrato do titular) -> senao 404.
export default async function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) redirect("/");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const recibo = await carregarRecibo(supabase, sessao.titularId, id);
  if (!recibo) notFound();

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-lg px-4 print:max-w-none print:px-0">
        <div className="mb-5 flex items-center justify-between print:hidden">
          <Link href="/parcelas" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Voltar aos pagamentos
          </Link>
          <ImprimirBotao />
        </div>

        <article className="rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
          <header className="border-b border-neutral-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">EXP Tour</p>
            <h1 className="mt-1 font-serif text-3xl text-brand">{recibo.titulo}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {recibo.descricao} · {recibo.dataFormatada}
            </p>
          </header>

          <dl className="mt-5 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {recibo.linhas.map((l, i) => (
              <div
                key={i}
                className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${l.destaque ? "bg-brand/5" : ""}`}
              >
                <dt className={l.destaque ? "font-semibold text-neutral-900" : "text-neutral-600"}>{l.rotulo}</dt>
                <dd className={`text-right ${l.destaque ? "text-base font-bold text-brand" : "font-medium text-neutral-900"}`}>
                  {l.valor}
                </dd>
              </div>
            ))}
          </dl>

          {recibo.avisoLegado && (
            <p className="mt-4 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3 text-xs text-neutral-700">
              {recibo.avisoLegado}
            </p>
          )}

          <p className="mt-4 text-xs text-neutral-500">{recibo.nota}</p>
        </article>
      </div>
    </div>
  );
}
