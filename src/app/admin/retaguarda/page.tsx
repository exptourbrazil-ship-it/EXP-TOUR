import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade, checarCapacidadeAdmin } from "@/lib/admin-guard";
import { carregarPainelRetaguarda, type LinhaAchado } from "@/lib/retaguarda-painel";
import type { SeveridadeAchado } from "@/lib/retaguarda";
import ConfirmarResolucaoBtn from "./ConfirmarResolucaoBtn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel de RETAGUARDA (camada detectiva 7-F / doc 07 §3.8 "Auditoria e saúde"):
// achados de inconsistência ABERTOS do tenant, mais graves primeiro. O detective
// (cron diário) flagra; a decisão que afeta o cliente passa por pessoa (LGPD art.
// 20 / spec 7-F.2). Escopo por tenant é na camada de dados; a capacidade é aqui.

const CHIP: Record<SeveridadeAchado, { rotulo: string; cor: string; bg: string }> = {
  alto: { rotulo: "Alto", cor: "#b91c1c", bg: "#fde8e8" },
  medio: { rotulo: "Médio", cor: "#b45309", bg: "#fdf0d5" },
  baixo: { rotulo: "Baixo", cor: "#3f6212", bg: "#eef6dd" },
};

const ROTULO_CATEGORIA: Record<string, string> = {
  parcela_paga_sem_lastro: "Parcela paga sem lastro",
  pagamento_sem_parcela_paga: "Pagamento sem parcela conciliada",
  remessa_antes_do_d7: "Compartilhado ao fornecedor antes do D+7",
  compartilhado_sem_carimbo: "Visível ao fornecedor sem carimbo de data",
  alteracao_sem_aceite: "Alteração de preço aplicada sem aceite",
  repactuacao_sem_aceite: "Repactuação aplicada sem aceite",
  documento_validade_insuficiente: "Documento vence antes da exigência do destino",
  carta_recusa_visto_atrasada: "Carta de recusa de visto não repassada em 1 dia útil",
  seguro_ausente_embarque: "Sem apólice de seguro antes do embarque",
  seguro_vigencia_insuficiente: "Apólice de seguro não cobre o período",
  seguro_cobertura_abaixo_minimo: "Cobertura do seguro abaixo do mínimo do destino",
  requisitos_consulado_incompletos: "Documentos exigidos pelo consulado ausentes",
  documentacao_inconsistente: "Identidade divergente entre os documentos",
  passagem_datas_incompativeis: "Data do bilhete incompatível com o programa",
  passagem_compra_antes_visto: "Bilhete comprado antes do visto",
  passagem_volta_antes_fim: "Volta do bilhete anterior ao fim do programa",
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function linkDoCaso(l: LinhaAchado): string | null {
  if (l.titularId) return `/admin/clientes/${l.titularId}?aba=financeiro`;
  return null;
}

export default async function PainelRetaguardaPage() {
  await exigirCapacidade("casos.ver", "/admin/retaguarda");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const painel = await carregarPainelRetaguarda(supabase);
  // O botão de confirmar exige a capacidade de AÇÃO (casos.gerir); a rota
  // reforça no servidor. Quem tem só casos.ver vê a fila, mas não confirma.
  const podeConfirmar = await checarCapacidadeAdmin("casos.gerir");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-serif text-2xl text-brand">Retaguarda · achados detectivos</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Inconsistências que a varredura diária encontrou e ainda estão abertas. As mais graves
        primeiro. O sistema apenas sinaliza — a decisão é humana.
      </p>

      <div className="mb-4 mt-4 flex flex-wrap gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Alto</div>
          <div className="text-xl font-semibold" style={{ color: "#b91c1c" }}>{painel.contadores.alto}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Médio</div>
          <div className="text-xl font-semibold" style={{ color: "#b45309" }}>{painel.contadores.medio}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Baixo</div>
          <div className="text-xl font-semibold" style={{ color: "#3f6212" }}>{painel.contadores.baixo}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Total aberto</div>
          <div className="text-xl font-semibold text-brand">{painel.contadores.total}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
          <div className="text-xs text-neutral-500">Aguardando confirmação</div>
          <div className="text-xl font-semibold" style={{ color: "#7c3aed" }}>{painel.contadores.aguardando}</div>
        </div>
      </div>

      {painel.linhas.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          Nenhum achado aberto. Nada fora do lugar na última varredura.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">Severidade</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Achado</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2">Visto por último</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {painel.linhas.map((l) => {
                const chip = CHIP[l.severidade];
                const href = linkDoCaso(l);
                return (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ color: chip.cor, background: chip.bg }}
                      >
                        {chip.rotulo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-800">
                      {ROTULO_CATEGORIA[l.categoria] ?? l.categoria}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{l.resumo}</td>
                    <td className="px-3 py-2 text-neutral-600">{fmtData(l.primeiraVezISO)}</td>
                    <td className="px-3 py-2 text-neutral-600">{fmtData(l.ultimaVezISO)}</td>
                    <td className="px-3 py-2 text-right">
                      {href ? (
                        <Link href={href} className="text-sm font-medium text-brand-golddark underline">
                          Abrir caso
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {painel.aguardando.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-serif text-lg text-brand">Aguardando confirmação de resolução</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Achados ALTO que sumiram da varredura e foram resolvidos automaticamente. Confirme que a
            inconsistência foi de fato tratada — assim uma resolução por edição não fecha o caso sem
            revisão humana.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Achado</th>
                  <th className="px-3 py-2">Desde</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {painel.aguardando.map((l) => {
                  const href = linkDoCaso(l);
                  return (
                    <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-3 py-2 text-neutral-800">
                        {ROTULO_CATEGORIA[l.categoria] ?? l.categoria}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{l.resumo}</td>
                      <td className="px-3 py-2 text-neutral-600">{fmtData(l.primeiraVezISO)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {href ? (
                            <Link href={href} className="text-sm font-medium text-brand-golddark underline">
                              Abrir caso
                            </Link>
                          ) : null}
                          {podeConfirmar ? (
                            <ConfirmarResolucaoBtn id={l.id} />
                          ) : (
                            <span className="text-xs text-neutral-400">aguardando</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
