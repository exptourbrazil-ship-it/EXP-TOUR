"use client";

import { useState } from "react";
import Link from "next/link";
import type { Caso, CasoContrato, CasoDocumento } from "@/lib/admin-caso";
import { fmtMoeda, fmtBRL, fmtData } from "@/lib/formato";
import {
  CATEGORIAS_DOCUMENTO,
  labelDoTipoDocumento,
  categoriaDoTipoDocumento,
  type CategoriaDocumento,
} from "@/lib/documentos";

// Caso 360 (FATIA 1, somente leitura). Recebe dados JA planos do servidor
// (sem service role) e organiza tudo do titular em abas. Vermelho e permitido
// no admin; estados sempre com icone + cor + texto.

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

export default function CasoClient({ caso }: { caso: Caso }) {
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
        {aba === "documentos" ? <AbaDocumentos caso={caso} /> : null}
        {aba === "comunicacao" ? <AbaComunicacao caso={caso} /> : null}
        {aba === "eventos" ? <AbaEventos caso={caso} /> : null}
        {aba === "acoes" ? <AbaAcoes /> : null}
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
                          <BadgeParcela status={p.status} />
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

function AbaDocumentos({ caso }: { caso: Caso }) {
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
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand">{labelDoTipoDocumento(d.tipo_documento)}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {d.nome_arquivo || "—"}
                        {d.origem ? ` · origem: ${d.origem}` : ""}
                        {d.created_at ? ` · ${fmtData(d.created_at.slice(0, 10))}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <BadgeDocumento status={d.status} />
                      <a
                        href={`/api/admin/documentos/${d.id}/download`}
                        className="text-sm text-brand-golddark hover:underline"
                      >
                        Baixar
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
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

function AbaAcoes() {
  const futuras = [
    "Analisar documento (aprovar / rejeitar com motivo)",
    "Reenviar acesso ao cliente",
    "Iniciar exceção operacional",
    "Override com justificativa registrada",
  ];
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-serif text-xl text-brand">Ações</h2>
        <span className="rounded-full bg-[#c9a35e]/20 px-2.5 py-1 text-xs font-medium text-[#8a6a2f]">
          Em breve (Fatia 2)
        </span>
      </div>
      <ul className="space-y-2">
        {futuras.map((f) => (
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
  );
}
