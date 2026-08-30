import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarExtrato } from "@/lib/extrato-service";
import { brl, moe, ptaxFmt } from "@/lib/recibo-view";
import ImprimirBotao from "@/app/contrato/[id]/ImprimirBotao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extrato de Saldo Devedor (Clausulas 6.8 / 7.12): saldo na moeda + R$ do dia
// (valor de quitacao), data-limite com marco D-30/D-15/D-5, e o historico de
// movimentos com a cotacao aplicada. Escopado por POSSE -> 404 se de outro titular.

function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MARCO_LABEL: Record<string, string> = {
  "D-30": "Faltam até 30 dias para a data-limite de quitação",
  "D-15": "Faltam até 15 dias para a data-limite de quitação",
  "D-5": "Faltam até 5 dias para a data-limite de quitação",
  vencido: "Data-limite de quitação vencida",
};

export default async function ExtratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) redirect("/");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const dados = await carregarExtrato(supabase, sessao.titularId, id);
  if (!dados) notFound();
  const { extrato, programaNome } = dados;
  const r = extrato.resumo;

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-2xl px-4 print:max-w-none print:px-0">
        <div className="mb-5 flex items-center justify-between print:hidden">
          <Link href="/parcelas" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Voltar aos pagamentos
          </Link>
          <ImprimirBotao />
        </div>

        <article className="rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
          <header className="border-b border-neutral-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">EXP Tour</p>
            <h1 className="mt-1 font-serif text-3xl text-brand">Extrato de Saldo Devedor</h1>
            <p className="mt-1 text-sm text-neutral-600">{programaNome}</p>
          </header>

          {/* Resumo */}
          <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">Saldo devedor</p>
              <p className="mt-1 text-xl font-bold text-brand">
                {r.quitado ? "Quitado" : moe(r.saldoMoeda, r.moeda)}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">Para quitar hoje (cotação do dia)</p>
              <p className="mt-1 text-xl font-bold text-brand-golddark">
                {r.quitado ? "—" : r.quitarHojeBRL != null ? "≈ " + brl(r.quitarHojeBRL) : "—"}
              </p>
              {!r.quitado && r.cotacaoHoje != null && (
                <p className="mt-0.5 text-xs text-neutral-400">VET {ptaxFmt(r.cotacaoHoje).replace("R$ ", "")}</p>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-xs text-neutral-500">Data-limite de quitação</p>
              <p className="mt-1 text-xl font-bold text-neutral-900">{fmtData(r.dataLimite)}</p>
              {!r.quitado && r.diasRestantes != null && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  {r.diasRestantes >= 0 ? `${r.diasRestantes} dias restantes` : `${-r.diasRestantes} dias em atraso`}
                </p>
              )}
            </div>
          </section>

          {/* Marco de quitacao (dourado = atencao; nunca vermelho na Area do Cliente) */}
          {r.marco && (
            <p className="mt-3 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3 text-sm text-neutral-700">
              ⏳ {MARCO_LABEL[r.marco]}
              {r.marco === "vencido" ? "." : ` (${fmtData(r.dataLimite)}).`} Você pode pagar quando e quanto quiser até
              essa data — o valor em reais é definido pela cotação do dia em cada pagamento.
            </p>
          )}

          {/* Historico de movimentos */}
          <section className="mt-6">
            <h2 className="mb-2 font-serif text-xl text-brand">Movimentações</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-2">Data</th>
                    <th className="py-2 pr-2">Descrição</th>
                    <th className="py-2 pr-2 text-right">Amortizado</th>
                    <th className="py-2 pr-2 text-right">Cotação (VET)</th>
                    <th className="py-2 pr-2 text-right">Pago (R$)</th>
                    <th className="py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {extrato.movimentos.map((m, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-2 pr-2 text-neutral-600">{fmtData(m.data)}</td>
                      <td className="py-2 pr-2 text-neutral-900">{m.descricao}</td>
                      <td className="py-2 pr-2 text-right text-neutral-900">
                        {m.amortizacaoMoeda != null ? moe(m.amortizacaoMoeda, r.moeda) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right text-neutral-600">
                        {m.cotacao != null ? ptaxFmt(m.cotacao).replace("R$ ", "") : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right text-neutral-600">{m.valorBRL != null ? brl(m.valorBRL) : "—"}</td>
                      <td className="py-2 text-right font-medium text-brand">{moe(m.saldoAposMoeda, r.moeda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mt-5 text-xs text-neutral-500">
            A obrigação é denominada na moeda do programa ({r.moeda}); o equivalente em reais é sempre uma estimativa
            pela cotação do dia e só é fixado no momento de cada pagamento (Cláusulas 6.3 e 6.7).
          </p>
        </article>
      </div>
    </div>
  );
}
