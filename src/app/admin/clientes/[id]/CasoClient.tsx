"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Caso, CasoContrato, CasoDocumento, CasoExcecao, CasoAcerto, CasoAlteracao } from "@/lib/admin-caso";
import { fmtMoeda, fmtBRL, fmtData } from "@/lib/formato";
import {
  TIPOS_EXCECAO,
  DESFECHOS_EXCECAO,
  labelTipoExcecao,
  type DesfechoExcecao,
} from "@/lib/excecao";
import { STATUS_VISTO, labelStatusVisto } from "@/lib/visto";
import { labelStatusDisputaMP } from "@/lib/mp-disputa";
import {
  CATEGORIAS_DOCUMENTO,
  MOTIVOS_REJEICAO_DOCUMENTO,
  labelDoTipoDocumento,
  categoriaDoTipoDocumento,
  type CategoriaDocumento,
} from "@/lib/documentos";

// Caso 360. Recebe dados JA planos do servidor e organiza tudo do titular em
// abas. FATIA 2 adiciona Acoes (analise de documento inline e reenvio de
// acesso), gateadas por capacidade via `permissoes`. Vermelho e permitido no
// admin; estados sempre com icone + cor + texto.

// Espelho da matriz RBAC para a UI. A rota de API SEMPRE revalida — isto so
// decide o que mostrar/habilitar.
export type PermissoesCaso = {
  analisarDocumentos: boolean;
  gerirCaso: boolean;
  gerirCancelamento: boolean;
  gerirFinanceiro: boolean;
};

type Aba = "jornada" | "financeiro" | "documentos" | "comunicacao" | "eventos" | "acoes";

const ABAS: { id: Aba; label: string }[] = [
  { id: "jornada", label: "Jornada" },
  { id: "financeiro", label: "Financeiro" },
  { id: "documentos", label: "Documentos" },
  { id: "comunicacao", label: "Comunicação" },
  { id: "eventos", label: "Eventos" },
  { id: "acoes", label: "Ações" },
];

// ---- Badges de estado (icone + cor + texto) --------------------------------

function BadgeJornada({ estado }: { estado: "concluida" | "andamento" | "pendente" }) {
  const mapa = {
    concluida: { icone: "✓", texto: "Concluída", cls: "bg-emerald-100 text-emerald-800" },
    andamento: { icone: "◐", texto: "Em andamento", cls: "bg-[#c9a35e]/20 text-[#8a6a2f]" },
    pendente: { icone: "○", texto: "Pendente", cls: "bg-neutral-100 text-neutral-500" },
  }[estado];
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + mapa.cls}>
      <span aria-hidden>{mapa.icone}</span>
      {mapa.texto}
    </span>
  );
}

function BadgeParcela({ status }: { status: string }) {
  const mapa: Record<string, { icone: string; texto: string; cls: string }> = {
    pago: { icone: "✓", texto: "Pago", cls: "bg-emerald-100 text-emerald-800" },
    atrasado: { icone: "!", texto: "Atrasado", cls: "bg-red-100 text-red-700" },
    pendente: { icone: "○", texto: "Pendente", cls: "bg-neutral-100 text-neutral-600" },
  };
  const m = mapa[status] || { icone: "•", texto: status || "—", cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + m.cls}>
      <span aria-hidden>{m.icone}</span>
      {m.texto}
    </span>
  );
}

function BadgeDocumento({ status }: { status: string | null }) {
  const mapa: Record<string, { icone: string; texto: string; cls: string }> = {
    aprovado: { icone: "✓", texto: "Aprovado", cls: "bg-emerald-100 text-emerald-800" },
    rejeitado: { icone: "×", texto: "Rejeitado", cls: "bg-red-100 text-red-700" },
    pendente: { icone: "○", texto: "Em análise", cls: "bg-[#c9a35e]/20 text-[#8a6a2f]" },
  };
  const m = mapa[status || ""] || { icone: "•", texto: status || "—", cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + m.cls}>
      <span aria-hidden>{m.icone}</span>
      {m.texto}
    </span>
  );
}

function BadgeEnvio({ sucesso }: { sucesso: boolean | null }) {
  if (sucesso === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
        <span aria-hidden>×</span>
        Falhou
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
      <span aria-hidden>✓</span>
      Enviado
    </span>
  );
}

function BadgeExcecao({ status }: { status: string }) {
  const mapa: Record<string, { icone: string; texto: string; cls: string }> = {
    aberta: { icone: "○", texto: "Aberta", cls: "bg-[#c9a35e]/20 text-[#8a6a2f]" },
    em_andamento: { icone: "◐", texto: "Em andamento", cls: "bg-[#c9a35e]/20 text-[#8a6a2f]" },
    resolvida: { icone: "✓", texto: "Resolvida", cls: "bg-emerald-100 text-emerald-800" },
    cancelada: { icone: "×", texto: "Cancelada", cls: "bg-neutral-100 text-neutral-500" },
  };
  const m = mapa[status] || { icone: "•", texto: status || "—", cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + m.cls}>
      <span aria-hidden>{m.icone}</span>
      {m.texto}
    </span>
  );
}

const LABEL_DESFECHO: Record<string, string> = {
  retomada: "Jornada retomada",
  redirecionamento: "Jornada redirecionada",
  encerramento: "Jornada encerrada",
};

// ---- Utilidades locais ------------------------------------------------------

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtData(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function nomeContrato(c: CasoContrato): string {
  return c.estudante_nome || c.nome || "Contrato";
}

function resumoDetalhe(detalhe: Record<string, unknown> | null): string {
  if (!detalhe) return "—";
  const partes = Object.entries(detalhe)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return partes.length > 0 ? partes.join(" · ") : "—";
}

// ---- Componente principal ---------------------------------------------------

export default function CasoClient({
  caso,
  permissoes,
}: {
  caso: Caso;
  permissoes: PermissoesCaso;
}) {
  const [aba, setAba] = useState<Aba>("jornada");
  const { titular, contratos } = caso;

  const contato = [titular.email, titular.telefone].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link href="/admin/clientes" className="text-sm text-brand-golddark hover:underline">
          ← Voltar para Clientes
        </Link>
      </div>

      {/* Cabecalho */}
      <header className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Caso 360</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">{titular.nome_completo || "(sem nome)"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {titular.cpf || "sem CPF"}
          {contato ? ` · ${contato}` : ""}
        </p>

        {/* Contratos do titular */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {contratos.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum contrato para este titular.</p>
          ) : (
            contratos.map((c) => (
              <div key={c.id} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-brand">{nomeContrato(c)}</div>
                  {c.cancelado_em ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                      <span aria-hidden>×</span>
                      Cancelado
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 space-y-0.5 text-xs text-neutral-600">
                  {c.nome ? (
                    <div>
                      <span className="text-neutral-400">Programa:</span> {c.nome}
                    </div>
                  ) : null}
                  {c.pais_destino ? (
                    <div>
                      <span className="text-neutral-400">Destino:</span> {c.pais_destino}
                    </div>
                  ) : null}
                  {c.visto_status ? (
                    <div>
                      <span className="text-neutral-400">Visto:</span>{" "}
                      <span className={c.visto_status === "negado" ? "font-medium text-red-700" : ""}>
                        {labelStatusVisto(c.visto_status)}
                      </span>
                    </div>
                  ) : null}
                  {c.valor_total != null ? (
                    <div>
                      <span className="text-neutral-400">Valor:</span>{" "}
                      {fmtMoeda(Number(c.valor_total), c.moeda || "BRL")}
                    </div>
                  ) : null}
                  {c.estudante_email ? (
                    <div>
                      <span className="text-neutral-400">E-mail do estudante:</span> {c.estudante_email}
                    </div>
                  ) : null}
                  {c.estudante_data_nascimento ? (
                    <div>
                      <span className="text-neutral-400">Nascimento:</span> {fmtData(c.estudante_data_nascimento)}
                    </div>
                  ) : null}
                  {c.created_at ? (
                    <div>
                      <span className="text-neutral-400">Criado em:</span> {fmtData(c.created_at.slice(0, 10))}
                    </div>
                  ) : null}
                </dl>
                {c.cancelado_em ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    <div>
                      <span className="font-medium">Cancelamento:</span> {c.cancelado_tipo || "—"} em{" "}
                      {fmtData(c.cancelado_em.slice(0, 10))}
                    </div>
                    {c.cancelado_motivo ? <div className="mt-0.5">Motivo: {c.cancelado_motivo}</div> : null}
                    {c.cancelado_por ? <div className="mt-0.5 text-red-500">Por: {c.cancelado_por}</div> : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Estado atual da jornada */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-neutral-500">Estado atual:</span>
          {caso.etapaAtual < caso.jornada.length ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#c9a35e]/20 px-2.5 py-1 text-xs font-medium text-[#8a6a2f]">
              <span aria-hidden>◐</span>
              {caso.jornada[caso.etapaAtual].nome}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <span aria-hidden>✓</span>
              Jornada concluída
            </span>
          )}
        </div>

        {/* Processo(s) de excecao ativo(s) — doc 01 §4: enquanto ha excecao
            aberta, o caso esta num processo paralelo. */}
        {caso.excecoesAtivas.length > 0 ? (
          <div className="mt-3 rounded-xl border border-[#c9a35e]/50 bg-[#c9a35e]/10 p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-[#8a6a2f]">
                ⚑
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#8a6a2f]">
                {caso.excecoesAtivas.length === 1
                  ? "Processo de exceção ativo"
                  : `${caso.excecoesAtivas.length} processos de exceção ativos`}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {caso.excecoesAtivas.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm text-[#6f551f]">
                  <span className="font-medium">{labelTipoExcecao(e.tipo)}</span>
                  <BadgeExcecao status={e.status} />
                  {Array.isArray(e.suspende) && e.suspende.length > 0 ? (
                    <span className="text-xs text-[#8a6a2f]">
                      suspende: {e.suspende.join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      {/* Abas */}
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={
              "rounded-t-lg px-3 py-2 text-sm font-medium transition " +
              (aba === a.id
                ? "border-b-2 border-brand text-brand"
                : "text-neutral-500 hover:text-brand")
            }
          >
            {a.label}
          </button>
        ))}
      </nav>

      <section>
        {aba === "jornada" ? <AbaJornada caso={caso} /> : null}
        {aba === "financeiro" ? <AbaFinanceiro caso={caso} /> : null}
        {aba === "documentos" ? <AbaDocumentos caso={caso} permissoes={permissoes} /> : null}
        {aba === "comunicacao" ? <AbaComunicacao caso={caso} /> : null}
        {aba === "eventos" ? <AbaEventos caso={caso} /> : null}
        {aba === "acoes" ? <AbaAcoes caso={caso} permissoes={permissoes} /> : null}
      </section>
    </div>
  );
}

// ---- Abas -------------------------------------------------------------------

function AbaJornada({ caso }: { caso: Caso }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 font-serif text-xl text-brand">Jornada</h2>
      <ol className="space-y-4">
        {caso.jornada.map((etapa, i) => (
          <li key={etapa.nome} className="flex items-start gap-3">
            <div
              className={
                "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                (etapa.estado === "concluida"
                  ? "bg-emerald-600 text-white"
                  : etapa.estado === "andamento"
                  ? "bg-[#c9a35e] text-white"
                  : "bg-neutral-200 text-neutral-500")
              }
              aria-hidden
            >
              {etapa.estado === "concluida" ? "✓" : etapa.estado === "andamento" ? "◐" : i + 1}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-brand">{etapa.nome}</p>
                <BadgeJornada estado={etapa.estado} />
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">{etapa.descricao}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AbaFinanceiro({ caso }: { caso: Caso }) {
  const { contratos, parcelas, pagamentos, moedaPorContrato, saldoPorMoeda, estimativaBRL } = caso;
  const saldoEntradas = Object.entries(saldoPorMoeda);

  return (
    <div className="space-y-5">
      {/* Saldo em aberto */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-serif text-xl text-brand">Saldo em aberto</h2>
        {saldoEntradas.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum saldo em aberto.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {saldoEntradas.map(([moeda, valor]) => (
              <span key={moeda} className="text-lg font-medium text-brand">
                {fmtMoeda(valor, moeda)}
              </span>
            ))}
            {estimativaBRL != null ? (
              <span className="text-sm text-neutral-500">≈ {fmtBRL(estimativaBRL)} (cotação do dia)</span>
            ) : (
              <span className="text-sm text-neutral-400">estimativa em BRL indisponível (sem cotação)</span>
            )}
          </div>
        )}
      </div>

      {/* Parcelas por contrato */}
      {contratos.map((c) => {
        const doContrato = parcelas.filter((p) => p.contrato_id === c.id);
        const moeda = moedaPorContrato[c.id] || c.moeda || "BRL";
        if (doContrato.length === 0) return null;
        return (
          <div key={c.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h3 className="mb-3 font-medium text-brand">
              {nomeContrato(c)} <span className="text-xs text-neutral-400">({moeda})</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 font-medium">Vencimento</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {doContrato.map((p) => {
                    const atual = Number(p.valor_atual ?? 0);
                    const original = Number(p.valor_original ?? 0);
                    const repactuada = Math.round(atual * 100) !== Math.round(original * 100);
                    return (
                      <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                        <td className="px-3 py-2 text-neutral-500">
                          {p.numero}
                          {p.is_entrada ? <span className="ml-1 text-[10px] text-brand-golddark">entrada</span> : null}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{p.descricao || "—"}</td>
                        <td className="px-3 py-2 text-neutral-600">{p.vencimento ? fmtData(p.vencimento) : "—"}</td>
                        <td className="px-3 py-2 text-right text-neutral-700">
                          {repactuada ? (
                            <span className="mr-1 text-xs text-neutral-400 line-through">
                              {fmtMoeda(original, moeda)}
                            </span>
                          ) : null}
                          <span className="font-medium">{fmtMoeda(atual, moeda)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <BadgeParcela status={p.status} />
                            {p.em_disputa ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                                <span aria-hidden>⚠</span>
                                {labelStatusDisputaMP(p.disputa_status)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Ledger de pagamentos (memoria cambial) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-serif text-xl text-brand">Memória cambial</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Ledger imutável de pagamentos: a fotografia do câmbio no momento de cada pagamento.
        </p>
        {pagamentos.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum pagamento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 text-right font-medium">Valor (programa)</th>
                  <th className="px-3 py-2 text-right font-medium">Cotação aplicada</th>
                  <th className="px-3 py-2 text-right font-medium">Valor em BRL</th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.map((pg, i) => (
                  <tr key={pg.parcela_id + ":" + i} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2 text-neutral-600">{fmtDataHora(pg.pago_em)}</td>
                    <td className="px-3 py-2 text-right text-neutral-700">
                      {pg.valor_programa != null ? fmtMoeda(Number(pg.valor_programa), pg.moeda || "BRL") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-600">
                      {pg.cotacao_aplicada != null
                        ? Number(pg.cotacao_aplicada).toLocaleString("pt-BR", { minimumFractionDigits: 4 })
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-brand">
                      {pg.valor_brl != null ? fmtBRL(Number(pg.valor_brl)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AbaDocumentos({ caso, permissoes }: { caso: Caso; permissoes: PermissoesCaso }) {
  const porCategoria = (cat: CategoriaDocumento): CasoDocumento[] =>
    caso.documentos.filter((d) => categoriaDoTipoDocumento(d.tipo_documento) === cat);

  return (
    <div className="space-y-5">
      {CATEGORIAS_DOCUMENTO.map((cat) => {
        const docs = porCategoria(cat.valor);
        return (
          <div key={cat.valor} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-serif text-xl text-brand">{cat.label}</h2>
            {docs.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum documento nesta categoria.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {docs.map((d) => (
                  <LinhaDocumento key={d.id} doc={d} podeAnalisar={permissoes.analisarDocumentos} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Uma linha de documento com a analise inline (aprovar/rejeitar). O download e a
// analise so aparecem para quem tem documentos.analisar (a rota tambem revalida).
function LinhaDocumento({ doc, podeAnalisar }: { doc: CasoDocumento; podeAnalisar: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<null | "aprovado" | "rejeitado">(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formRejeicao, setFormRejeicao] = useState(false);
  const [motivoSel, setMotivoSel] = useState(MOTIVOS_REJEICAO_DOCUMENTO[0].valor);
  const [detalhe, setDetalhe] = useState("");

  async function definirStatus(status: "aprovado" | "rejeitado", motivo?: string) {
    setErro(null);
    setEnviando(status);
    try {
      const res = await fetch("/api/admin/documentos/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, status, motivo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao atualizar o documento.");
        setEnviando(null);
        return;
      }
      setFormRejeicao(false);
      setDetalhe("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setEnviando(null);
    }
  }

  function confirmarRejeicao() {
    const sel = MOTIVOS_REJEICAO_DOCUMENTO.find((m) => m.valor === motivoSel);
    const texto = detalhe.trim();
    if (motivoSel === "outro") {
      if (!texto) {
        setErro("Descreva o motivo da rejeicao.");
        return;
      }
      definirStatus("rejeitado", texto);
      return;
    }
    const motivo = texto ? `${sel?.label} — ${texto}` : sel?.label || "";
    definirStatus("rejeitado", motivo);
  }

  const ocupado = enviando !== null;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand">{labelDoTipoDocumento(doc.tipo_documento)}</p>
          <p className="truncate text-xs text-neutral-500">
            {doc.nome_arquivo || "—"}
            {doc.origem ? ` · origem: ${doc.origem}` : ""}
            {doc.created_at ? ` · ${fmtData(doc.created_at.slice(0, 10))}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BadgeDocumento status={doc.status} />
          {podeAnalisar ? (
            <a
              href={`/api/admin/documentos/${doc.id}/download`}
              className="text-sm text-brand-golddark hover:underline"
            >
              Baixar
            </a>
          ) : null}
        </div>
      </div>

      {/* Motivo de uma rejeicao anterior */}
      {doc.status === "rejeitado" && doc.motivo_rejeicao ? (
        <p className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <span className="font-medium">Motivo da rejeição:</span> {doc.motivo_rejeicao}
        </p>
      ) : null}

      {/* Acoes de analise (aprovar / rejeitar) */}
      {podeAnalisar ? (
        <div className="mt-2">
          {!formRejeicao ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => definirStatus("aprovado")}
                disabled={ocupado || doc.status === "aprovado"}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando === "aprovado" ? "Aprovando…" : doc.status === "aprovado" ? "Aprovado" : "Aprovar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  setFormRejeicao(true);
                }}
                disabled={ocupado}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Rejeitar
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <label className="block text-xs font-medium text-red-800">Motivo da rejeição</label>
              <select
                value={motivoSel}
                onChange={(e) => setMotivoSel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700"
              >
                {MOTIVOS_REJEICAO_DOCUMENTO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                placeholder={motivoSel === "outro" ? "Descreva o motivo" : "Detalhe (opcional)"}
                maxLength={500}
                className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmarRejeicao}
                  disabled={ocupado}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enviando === "rejeitado" ? "Rejeitando…" : "Confirmar rejeição"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormRejeicao(false);
                    setErro(null);
                  }}
                  disabled={ocupado}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {erro ? <p className="mt-1 text-xs text-red-600">{erro}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function AbaComunicacao({ caso }: { caso: Caso }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 font-serif text-xl text-brand">Comunicação</h2>
      {caso.comunicacao.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma mensagem registrada para este cliente.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {caso.comunicacao.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                    {m.canal === "email" ? "E-mail" : "WhatsApp"}
                  </span>
                  <span className="text-sm text-brand">{m.tipo_mensagem || "—"}</span>
                </div>
                {m.erro ? <p className="mt-0.5 text-xs text-red-600">{m.erro}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <BadgeEnvio sucesso={m.sucesso} />
                <span className="text-xs text-neutral-500">{fmtDataHora(m.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaEventos({ caso }: { caso: Caso }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Eventos</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Trilha de auditoria filtrada do caso — a resposta para &quot;o que aconteceu aqui&quot;.
      </p>
      {caso.eventos.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum evento registrado para este caso.</p>
      ) : (
        <ul className="space-y-3">
          {caso.eventos.map((e, i) => (
            <li key={i} className="border-l-2 border-neutral-200 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-brand">{e.acao || "—"}</span>
                <span className="text-xs text-neutral-400">{fmtDataHora(e.criado_em)}</span>
              </div>
              <p className="text-xs text-neutral-500">
                {e.usuario || "—"}
                {e.ip ? ` · ${e.ip}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">{resumoDetalhe(e.detalhe)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaAcoes({ caso, permissoes }: { caso: Caso; permissoes: PermissoesCaso }) {
  const { titular } = caso;
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function reenviarAcesso() {
    setFeedback(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${titular.id}/reenviar-acesso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao reenviar o acesso." });
        return;
      }
      setFeedback({ ok: true, msg: `Código de acesso reenviado para ${titular.email}.` });
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Reenviar acesso ao cliente */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-serif text-xl text-brand">Reenviar acesso</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Gera um novo código de acesso e envia para o e-mail do titular. Invalida os códigos
          anteriores em aberto.
        </p>
        {permissoes.gerirCaso ? (
          <>
            <button
              type="button"
              onClick={reenviarAcesso}
              disabled={enviando || !titular.email}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Reenviar código de acesso"}
            </button>
            {!titular.email ? (
              <p className="mt-2 text-xs text-neutral-500">
                Este titular não tem e-mail cadastrado.
              </p>
            ) : null}
            {feedback ? (
              <p className={"mt-2 text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-neutral-500">
            Você não tem permissão para reenviar o acesso deste cliente.
          </p>
        )}
      </div>

      {/* Resultado do visto — dispara o E1 na transicao para negado */}
      <SecaoVisto caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Pedido de cancelamento do cliente — abre o E4 */}
      <SecaoCancelamento caso={caso} podeGerir={permissoes.gerirCancelamento} />

      {/* Cancelamento pela escola — abre o E6 */}
      <SecaoCancelamentoEscola caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Hold de verificacao (suspeita de fraude) — abre o E10 */}
      <SecaoHoldFraude caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Cliente incontactavel — abre o E11 */}
      <SecaoIncontactavel caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Pedido de adiamento de inicio — abre o E2 */}
      <SecaoDeferral caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Motor de alteracao — previa do plano recalculado no adiamento (E2) */}
      <SecaoAlteracao caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Alteracao de escopo — abre o E3 */}
      <SecaoExcecaoRotulada
        caso={caso}
        podeGerir={permissoes.gerirCaso}
        tipo="alteracao_escopo"
        titulo="Alteração de escopo"
        descricao="Extensão, upgrade, troca de escola/cidade ou serviços adicionais. Abre o processo E3 (cai na fila da operação). O delta financeiro / aditivo é um passo à parte (motor de alteração)."
        opcoes={[
          { valor: "Extensão", rotulo: "Extensão" },
          { valor: "Upgrade", rotulo: "Upgrade" },
          { valor: "Troca de escola/cidade", rotulo: "Troca de escola/cidade" },
          { valor: "Serviços adicionais", rotulo: "Serviços adicionais" },
        ]}
        rotuloOpcoes="Tipo de alteração"
        prefixoMotivo="Alteração de escopo"
        rotuloBotao="Registrar alteração de escopo"
      />

      {/* Interrupcao durante o programa — abre o E7 */}
      <SecaoExcecaoRotulada
        caso={caso}
        podeGerir={permissoes.gerirCaso}
        tipo="interrupcao_programa"
        titulo="Interrupção durante o programa"
        descricao="Retorno antecipado (saúde, família, insatisfação, conduta, imigração). Abre o processo E7: suspende a cobrança e o avanço para análise. O acerto (com seguro/refund) é conduzido à parte."
        opcoes={[
          { valor: "Saúde", rotulo: "Saúde" },
          { valor: "Família", rotulo: "Família" },
          { valor: "Insatisfação", rotulo: "Insatisfação" },
          { valor: "Conduta", rotulo: "Conduta" },
          { valor: "Imigração", rotulo: "Barrado na imigração" },
          { valor: "Outro", rotulo: "Outro" },
        ]}
        rotuloOpcoes="Causa"
        prefixoMotivo="Interrupção do programa"
        rotuloBotao="Registrar interrupção"
      />

      {/* Acerto de cancelamento (rascunho) — motor de acerto */}
      <SecaoAcerto caso={caso} podeGerir={permissoes.gerirFinanceiro} />

      {/* Processos de excecao (doc 01 §4) */}
      <SecaoExcecoes caso={caso} podeGerir={permissoes.gerirCaso} />

      {/* Analise de documentos: vive na aba Documentos */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-serif text-xl text-brand">Analisar documentos</h2>
        <p className="text-xs text-neutral-500">
          A aprovação e a rejeição (com motivo) de cada documento ficam na aba{" "}
          <span className="font-medium text-brand">Documentos</span>.
        </p>
      </div>

      {/* Acoes ainda nao construidas (precisam de infraestrutura propria) */}
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-serif text-xl text-brand">Ações avançadas</h2>
          <span className="rounded-full bg-[#c9a35e]/20 px-2.5 py-1 text-xs font-medium text-[#8a6a2f]">
            Em breve
          </span>
        </div>
        <ul className="space-y-2">
          {["Override com justificativa registrada"].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm text-neutral-400"
              >
                {f}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Resultado do visto (dispara E1 na transicao para negado) ---------------

function SecaoVisto({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [status, setStatus] = useState<(typeof STATUS_VISTO)[number]>("em_analise");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function registrar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/visto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao registrar o visto." });
        return;
      }
      const msg = data.excecaoDisparada
        ? "Visto negado registrado. Processo E1 aberto: cobrança pausada, tarefa ao consultor e aviso ao cliente."
        : "Status do visto atualizado.";
      setFeedback({ ok: true, msg });
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  if (!podeGerir) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-serif text-xl text-brand">Resultado do visto</h2>
        <p className="text-xs text-neutral-500">
          Você não tem permissão para registrar o resultado do visto.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Resultado do visto</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Marcar <span className="font-medium">Negado</span> dispara o processo E1: pausa a régua de
        cobrança, abre tarefa de contato ao consultor (24h) e avisa o cliente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-neutral-500">Contrato</span>
          <select
            value={contratoId}
            onChange={(e) => setContratoId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
          >
            {caso.contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">Resultado</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUS_VISTO)[number])}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
          >
            {STATUS_VISTO.map((s) => (
              <option key={s} value={s}>
                {labelStatusVisto(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={registrar}
          disabled={enviando || caso.contratos.length === 0}
          className={
            "rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 " +
            (status === "negado" ? "bg-red-600" : "bg-brand")
          }
        >
          {enviando ? "Registrando…" : "Registrar resultado"}
        </button>
        {feedback ? (
          <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
            {feedback.msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---- Pedido de cancelamento do cliente (abre o E4) --------------------------

function SecaoCancelamento({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function registrar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/cancelamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, motivo: motivo.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao registrar o pedido." });
        return;
      }
      setFeedback({
        ok: true,
        msg: data.excecaoAberta
          ? "Pedido registrado. Processo E4 aberto: cobrança pausada e caso na fila do consultor (retenção)."
          : "Já havia um processo de cancelamento aberto para este contrato.",
      });
      setMotivo("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Pedido de cancelamento do cliente</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Abre o processo E4: pausa a régua de cobrança e coloca o caso na fila do consultor para a
        conversa de retenção. Não cancela nem reembolsa — a execução/acerto é um passo à parte.
      </p>
      {podeGerir ? (
        <>
          <label className="block max-w-md">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={registrar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Registrar pedido de cancelamento"}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para registrar cancelamento (Consultor, Financeiro ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Cancelamento pela escola (abre o E6) -----------------------------------

function SecaoCancelamentoEscola({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function registrar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/cancelamento-escola`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, motivo: motivo.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao registrar." });
        return;
      }
      setFeedback({
        ok: true,
        msg: data.excecaoAberta
          ? `Processo E6 aberto: cobrança pausada e caso na fila da operação (realocar/reembolsar).${
              data.avisoEnviado ? " Cliente avisado por e-mail." : " Aviso ao cliente não enviado — verifique o e-mail do titular."
            }`
          : "Já havia um processo de cancelamento pela escola aberto para este contrato.",
      });
      setMotivo("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Cancelamento pela escola</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Turma não abriu / escola fechou. Abre o processo E6: pausa a cobrança, avisa o cliente
        proativamente e coloca o caso na fila da operação para realocar ou reembolsar. A execução é
        um passo à parte.
      </p>
      {podeGerir ? (
        <>
          <label className="block max-w-md">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={registrar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Registrar cancelamento pela escola"}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para registrar cancelamento pela escola (Operação ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Hold de verificacao / suspeita de fraude (abre o E10) ------------------

function SecaoHoldFraude({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function marcar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/hold-fraude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, motivo: motivo.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao marcar o hold." });
        return;
      }
      setFeedback({
        ok: true,
        msg: data.excecaoAberta
          ? "Hold de verificação (E10) ativo: avanço para assinatura/remessa bloqueado até resolver."
          : "Já havia um hold de verificação ativo para este contrato.",
      });
      setMotivo("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Hold de verificação (suspeita de fraude)</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Trava o avanço para estados onerosos (enviar contrato para assinatura, remessa à escola,
        passagem) até a verificação humana. Não notifica o cliente. Para liberar, resolva o processo
        E10 em <span className="font-medium text-brand">Processos de exceção</span>.
      </p>
      {podeGerir ? (
        <>
          <label className="block max-w-md">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Motivo / sinal (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Ex.: documento inconsistente, dados divergentes, pagamento anômalo"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={marcar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Marcando…" : "Marcar hold de verificação"}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para marcar hold de verificação (Operação ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Cliente incontactavel (abre o E11) -------------------------------------

function SecaoIncontactavel({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function marcar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/incontactavel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, motivo: motivo.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao marcar." });
        return;
      }
      setFeedback({
        ok: true,
        msg: data.excecaoAberta
          ? "Processo E11 aberto: caso escalado na fila da operação para contato."
          : "Já havia um processo de incontactável aberto para este contrato.",
      });
      setMotivo("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Cliente incontactável</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Pendência parada, cliente não responde. Abre o processo E11 (escala o caso na fila da
        operação para contato). Não cobra, não cancela e não notifica o cliente automaticamente.
        Também é aberto pelo cron quando um documento rejeitado fica 30 dias sem reenvio. Para
        encerrar, resolva o E11 em <span className="font-medium text-brand">Processos de exceção</span>.
      </p>
      {podeGerir ? (
        <>
          <label className="block max-w-md">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Motivo / pendência (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Ex.: não responde e-mail/WhatsApp; documento pendente há semanas"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={marcar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Marcando…" : "Marcar incontactável"}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para marcar incontactável (Operação ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Excecao rotulada generica (abre um tipo fixo via a rota /excecoes) ------
// Usada por E3 (alteracao de escopo) e E7 (interrupcao): tipo fixo + um seletor
// estruturado (tipo de alteracao / causa) + detalhe, compondo o motivo. Reusa a
// rota generica de abrir excecao — sem backend novo.

function SecaoExcecaoRotulada({
  caso,
  podeGerir,
  tipo,
  titulo,
  descricao,
  opcoes,
  rotuloOpcoes,
  prefixoMotivo,
  rotuloBotao,
}: {
  caso: Caso;
  podeGerir: boolean;
  tipo: string;
  titulo: string;
  descricao: string;
  opcoes: { valor: string; rotulo: string }[];
  rotuloOpcoes: string;
  prefixoMotivo: string;
  rotuloBotao: string;
}) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [opcao, setOpcao] = useState(opcoes[0]?.valor || "");
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function registrar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    const partes = [prefixoMotivo];
    if (opcao) partes.push(opcao);
    if (detalhe.trim()) partes.push(detalhe.trim());
    const motivo = partes.join(" — ");
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/excecoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, tipo, motivo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao registrar." });
        return;
      }
      setFeedback({ ok: true, msg: "Processo aberto e registrado na fila." });
      setDetalhe("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">{titulo}</h2>
      <p className="mb-3 text-xs text-neutral-500">{descricao}</p>
      {podeGerir ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Contrato</span>
              <select
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {caso.contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomeContrato(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">{rotuloOpcoes}</span>
              <select
                value={opcao}
                onChange={(e) => setOpcao(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Detalhe (opcional)</span>
            <textarea
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={registrar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : rotuloBotao}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para registrar isto (Operação ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Pedido de adiamento de inicio (abre o E2) ------------------------------

function SecaoDeferral({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function registrar() {
    setFeedback(null);
    if (!contratoId) {
      setFeedback({ ok: false, msg: "Selecione o contrato." });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/deferral`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contratoId,
          novaDataInicio: novaData || null,
          motivo: motivo.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setFeedback({ ok: false, msg: data?.error || "Falha ao registrar o pedido." });
        return;
      }
      setFeedback({
        ok: true,
        msg: data.excecaoAberta
          ? "Processo E2 aberto: avanço suspenso e caso na fila da operação (consultar a escola)."
          : "Já havia um pedido de adiamento aberto para este contrato.",
      });
      setNovaData("");
      setMotivo("");
      router.refresh();
    } catch {
      setFeedback({ ok: false, msg: "Falha de rede. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Pedido de adiamento de início</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Abre o processo E2: suspende o avanço da jornada e coloca o caso na fila da operação para
        consultar a escola. Não recalcula marcos/parcelas nem gera aditivo — o recálculo em cascata é
        um passo à parte.
      </p>
      {podeGerir ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Contrato</span>
              <select
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {caso.contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomeContrato(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">Nova data de início (opcional)</span>
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 block max-w-md">
            <span className="text-xs text-neutral-500">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={registrar}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Registrar pedido de adiamento"}
            </button>
            {feedback ? (
              <span className={"text-xs " + (feedback.ok ? "text-emerald-700" : "text-red-600")}>
                {feedback.msg}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Você não tem permissão para registrar adiamento (Operação ou Gestor).
        </p>
      )}
    </div>
  );
}

// ---- Motor de alteracao: previa do plano no adiamento (E2) ------------------

function AlteracaoCard({
  alteracao,
  contratos,
}: {
  alteracao: CasoAlteracao;
  contratos: CasoContrato[];
}) {
  const contrato = contratos.find((c) => c.id === alteracao.contrato_id);
  const moeda = alteracao.moeda || "BRL";
  const plano = alteracao.plano_proposto || [];
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-brand">
          {contrato ? nomeContrato(contrato) : "Contrato"}
        </span>
        <span className="text-xs text-neutral-400">{fmtDataHora(alteracao.criado_em)}</span>
      </div>
      {alteracao.provisorio ? (
        <p className="mt-1 rounded-lg bg-[#c9a35e]/15 px-2.5 py-1.5 text-xs text-[#8a6a2f]">
          ⚠ Prévia provisória — não reescreve parcelas nem gera aditivo. A aplicação é um passo à
          parte, após revisão do Financeiro/Operação.
        </p>
      ) : null}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Início atual</dt>
        <dd className="text-right text-neutral-700">{fmtData(alteracao.data_inicio_atual || "")}</dd>
        <dt className="text-neutral-500">Novo início</dt>
        <dd className="text-right font-medium text-neutral-800">
          {fmtData(alteracao.nova_data_inicio || "")}
        </dd>
        <dt className="text-neutral-500">Nova data-limite de quitação</dt>
        <dd className="text-right font-medium text-neutral-800">
          {fmtData(alteracao.nova_data_quitacao || "")}
        </dd>
        <dt className="text-neutral-500">Saldo em aberto</dt>
        <dd className="text-right text-neutral-700">
          {fmtMoeda(Number(alteracao.saldo_devedor || 0), moeda)}
        </dd>
      </dl>
      {plano.length > 0 ? (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-500">
              <th className="py-1 text-left font-normal">Parcela</th>
              <th className="py-1 text-left font-normal">Vencimento</th>
              <th className="py-1 text-right font-normal">Valor</th>
            </tr>
          </thead>
          <tbody>
            {plano.map((p) => (
              <tr key={p.numero} className="border-b border-neutral-100 last:border-0">
                <td className="py-1 text-neutral-600">{p.numero}</td>
                <td className="py-1 text-neutral-600">{fmtData(p.vencimento)}</td>
                <td className="py-1 text-right font-medium text-neutral-700">
                  {fmtMoeda(Number(p.valor), moeda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          Sem saldo em aberto para reagendar — nada a recalcular.
        </p>
      )}
    </div>
  );
}

function SecaoAlteracao({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [novaData, setNovaData] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function calcular() {
    setErro(null);
    if (!contratoId) {
      setErro("Selecione o contrato.");
      return;
    }
    if (!novaData) {
      setErro("Informe a nova data de início.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/alteracao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, novaDataInicio: novaData }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao calcular o plano.");
        return;
      }
      setNovaData("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Plano recalculado do adiamento (rascunho)</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Para um contrato com pedido de adiamento (E2) ativo, calcula a prévia do novo plano: nova
        data-limite de quitação (D-30 do novo início) e o reagendamento do saldo em aberto. É um
        rascunho para revisão — não reescreve parcelas, não gera aditivo e não toca dinheiro.
      </p>

      {podeGerir ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Nova data de início</span>
            <input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={calcular}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Calculando…" : "Calcular plano proposto"}
            </button>
            {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">
          Somente a Operação (ou Gestor) calcula o plano. Os rascunhos existentes ficam abaixo.
        </p>
      )}

      {caso.alteracoes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum plano calculado.</p>
      ) : (
        <div className="space-y-3">
          {caso.alteracoes.map((a) => (
            <AlteracaoCard key={a.id} alteracao={a} contratos={caso.contratos} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Acerto de cancelamento (rascunho) — motor de acerto --------------------

function AcertoCard({ acerto, contratos }: { acerto: CasoAcerto; contratos: CasoContrato[] }) {
  const contrato = contratos.find((c) => c.id === acerto.contrato_id);
  const moeda = acerto.moeda || "BRL";
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-brand">
          {contrato ? nomeContrato(contrato) : "Contrato"}
          {acerto.tipo_cancelamento ? (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {labelTipoExcecao(acerto.tipo_cancelamento)}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-neutral-400">{fmtDataHora(acerto.criado_em)}</span>
      </div>
      {acerto.provisorio ? (
        <p className="mt-1 rounded-lg bg-[#c9a35e]/15 px-2.5 py-1.5 text-xs text-[#8a6a2f]">
          ⚠ Valores provisórios — regras de retenção pendentes de validação jurídica (config).
        </p>
      ) : null}
      <table className="mt-2 w-full text-sm">
        <tbody>
          {(acerto.memoria || []).map((l, i) => (
            <tr key={i} className="border-b border-neutral-100 last:border-0">
              <td className="py-1 text-neutral-600">{l.rotulo}</td>
              <td
                className={
                  "py-1 text-right font-medium " +
                  (l.tipo === "credito"
                    ? "text-emerald-700"
                    : l.tipo === "debito"
                    ? "text-red-700"
                    : "text-neutral-700")
                }
              >
                {fmtMoeda(Number(l.valor), moeda)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecaoAcerto({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState(caso.contratos[0]?.id || "");
  const [refundEscola, setRefundEscola] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function calcular() {
    setErro(null);
    if (!contratoId) {
      setErro("Selecione o contrato.");
      return;
    }
    setEnviando(true);
    try {
      const refundNum = refundEscola.trim() === "" ? null : Number(refundEscola);
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/acerto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, refundEscolaEsperado: refundNum }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao calcular o acerto.");
        return;
      }
      setRefundEscola("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Acerto de cancelamento (rascunho)</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Calcula a retenção/multa e o saldo a devolver, com memória de cálculo, para um contrato em
        processo de cancelamento (E4/E5/E6/E7). É um rascunho para revisão do Financeiro — não
        propõe ao cliente, não coleta aceite e não executa reembolso.
      </p>

      {podeGerir ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-neutral-500">Contrato</span>
            <select
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {caso.contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeContrato(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Refund esperado da escola (opcional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={refundEscola}
              onChange={(e) => setRefundEscola(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={calcular}
              disabled={enviando || caso.contratos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Calculando…" : "Calcular acerto"}
            </button>
            {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">
          Somente o Financeiro (ou Gestor) calcula o acerto. Os rascunhos existentes ficam abaixo.
        </p>
      )}

      {caso.acertos.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum acerto calculado.</p>
      ) : (
        <div className="space-y-3">
          {caso.acertos.map((a) => (
            <AcertoCard key={a.id} acerto={a} contratos={caso.contratos} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Processos de excecao (abrir / conduzir / resolver) ---------------------

function SecaoExcecoes({ caso, podeGerir }: { caso: Caso; podeGerir: boolean }) {
  const router = useRouter();
  const contratosAtivos = caso.contratos;
  const [contratoId, setContratoId] = useState(contratosAtivos[0]?.id || "");
  const [tipo, setTipo] = useState(TIPOS_EXCECAO[0].valor);
  const [motivo, setMotivo] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setErro(null);
    if (!contratoId) {
      setErro("Selecione o contrato.");
      return;
    }
    setAbrindo(true);
    try {
      const res = await fetch(`/api/admin/clientes/${caso.titular.id}/excecoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, tipo, motivo: motivo.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao abrir a exceção.");
        return;
      }
      setMotivo("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 font-serif text-xl text-brand">Processos de exceção</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Um processo paralelo que suspende partes do motor (cobrança, lembretes, avanço) e, ao
        fechar, retoma, redireciona ou encerra a jornada.
      </p>

      {/* Abrir nova excecao */}
      {podeGerir ? (
        <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-2 text-sm font-medium text-brand">Iniciar exceção</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Contrato</span>
              <select
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {contratosAtivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomeContrato(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {TIPOS_EXCECAO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.codigo} · {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block">
            <span className="text-xs text-neutral-500">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={abrir}
              disabled={abrindo || contratosAtivos.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {abrindo ? "Abrindo…" : "Abrir exceção"}
            </button>
            {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Lista de excecoes do caso */}
      {caso.excecoes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum processo de exceção neste caso.</p>
      ) : (
        <ul className="space-y-3">
          {caso.excecoes.map((e) => (
            <LinhaExcecao key={e.id} exc={e} caso={caso} podeGerir={podeGerir} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaExcecao({
  exc,
  caso,
  podeGerir,
}: {
  exc: CasoExcecao;
  caso: Caso;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [formResolver, setFormResolver] = useState(false);
  const [desfecho, setDesfecho] = useState<DesfechoExcecao>(DESFECHOS_EXCECAO[0]);
  const [resolucao, setResolucao] = useState("");

  const contrato = caso.contratos.find((c) => c.id === exc.contrato_id);
  const terminal = exc.status === "resolvida" || exc.status === "cancelada";

  async function mudar(para: string, extra?: Record<string, unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/admin/excecoes/${exc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para, ...(extra || {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao atualizar a exceção.");
        return;
      }
      setFormResolver(false);
      setResolucao("");
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="rounded-xl border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-brand">{labelTipoExcecao(exc.tipo)}</span>
          <BadgeExcecao status={exc.status} />
        </div>
        <span className="text-xs text-neutral-400">{fmtDataHora(exc.aberta_em)}</span>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
        {contrato ? <div>Contrato: {nomeContrato(contrato)}</div> : null}
        {Array.isArray(exc.suspende) && exc.suspende.length > 0 ? (
          <div>Suspende: {exc.suspende.join(", ")}</div>
        ) : (
          <div>Não suspende o motor.</div>
        )}
        {exc.etapa ? <div>Etapa: {exc.etapa}</div> : null}
        {exc.motivo ? <div>Motivo: {exc.motivo}</div> : null}
        {exc.aberta_por ? <div className="text-neutral-400">Aberta por: {exc.aberta_por}</div> : null}
        {terminal && exc.desfecho ? (
          <div className="text-neutral-600">
            {LABEL_DESFECHO[exc.desfecho] || exc.desfecho}
            {exc.resolucao ? ` — ${exc.resolucao}` : ""}
            {exc.resolvida_por ? ` (${exc.resolvida_por})` : ""}
          </div>
        ) : null}
      </div>

      {/* Acoes da maquina de estados */}
      {podeGerir && !terminal ? (
        <div className="mt-2">
          {!formResolver ? (
            <div className="flex flex-wrap items-center gap-2">
              {exc.status === "aberta" ? (
                <button
                  type="button"
                  onClick={() => mudar("em_andamento")}
                  disabled={ocupado}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Assumir
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  setFormResolver(true);
                }}
                disabled={ocupado}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                Resolver
              </button>
              <button
                type="button"
                onClick={() => mudar("cancelada")}
                disabled={ocupado}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancelar exceção
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <label className="block text-xs font-medium text-emerald-800">Desfecho</label>
              <select
                value={desfecho}
                onChange={(e) => setDesfecho(e.target.value as DesfechoExcecao)}
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm"
              >
                {DESFECHOS_EXCECAO.map((d) => (
                  <option key={d} value={d}>
                    {LABEL_DESFECHO[d]}
                  </option>
                ))}
              </select>
              <textarea
                value={resolucao}
                onChange={(e) => setResolucao(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Como foi resolvido?"
                className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!resolucao.trim()) {
                      setErro("Informe a resolução.");
                      return;
                    }
                    mudar("resolvida", { desfecho, resolucao: resolucao.trim() });
                  }}
                  disabled={ocupado}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Confirmar resolução
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormResolver(false);
                    setErro(null);
                  }}
                  disabled={ocupado}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {erro ? <p className="mt-1 text-xs text-red-600">{erro}</p> : null}
        </div>
      ) : null}

      {/* Reabrir uma resolvida (correcao de fechamento precoce) */}
      {podeGerir && exc.status === "resolvida" ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => mudar("em_andamento")}
            disabled={ocupado}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            Reabrir
          </button>
          {erro ? <p className="mt-1 text-xs text-red-600">{erro}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
