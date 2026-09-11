"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeadDetalhe } from "@/lib/admin-leads";
import { STATUS_LEAD_LABEL, proximosStatusLead, statusLeadValido, type StatusLead } from "@/lib/leads";
import { mascararCpf } from "@/lib/cpf";
import { fmtData, fmtMoeda, fmtBRL } from "@/lib/formato";
import StatusBadge from "../StatusBadge";

// Lê com seguranca um campo de `params` (jsonb do orcamento).
function comoTexto(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  return null;
}
function comoNumero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type LinhaPrograma = { curso?: string; escola?: string; moeda?: string; totalMoeda?: number; totalBRL?: number };

export default function LeadCasoClient({ lead }: { lead: LeadDetalhe }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<StatusLead | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const statusAtual: StatusLead = statusLeadValido(lead.status) ? lead.status : "novo";
  const proximos = proximosStatusLead(statusAtual);

  const params = (lead.params ?? {}) as Record<string, unknown>;
  const inicio = comoTexto(params.inicio);
  const weeks = comoNumero(params.weeks);
  const accom = params.accom === true;
  const accomTipo = comoTexto(params.accomTipo);
  const seguro = params.seguro === true;
  const programas = Array.isArray(params.programas) ? (params.programas as LinhaPrograma[]) : [];
  const aceite = (params.aceite_termos ?? null) as { aceito?: boolean; em?: string; ip?: string } | null;

  async function mudarStatus(novo: StatusLead) {
    setErro(null);
    setSalvando(novo);
    try {
      const resp = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json.erro || "Não foi possível atualizar o status.");
      } else {
        router.refresh();
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/leads" className="text-sm text-brand hover:underline">← Voltar aos leads</Link>

      <header className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Lead · Comercial</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-serif text-3xl text-brand">{lead.nome || "(sem nome)"}</h1>
            <StatusBadge status={lead.status} />
            {lead.temTitular ? (
              <span
                title="CPF já tem conta na Área do Cliente"
                className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
              >
                cliente existente
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-neutral-500">
            Recebido em {fmtData((lead.createdAt || "").slice(0, 10))} · origem {lead.origem}
          </p>
        </div>
      </header>

      {erro ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contato / identidade */}
          <Secao titulo="Titular (responsável / conta)">
            <Campo rotulo="Nome" valor={lead.nome || "—"} />
            <Campo rotulo="CPF" valor={lead.cpf ? mascararCpf(lead.cpf) : "—"} />
            <Campo rotulo="E-mail" valor={lead.email || "—"} />
            <Campo rotulo="Telefone" valor={lead.telefone || "—"} />
            {lead.participanteNome ? (
              <Campo rotulo="Participante (aluno)" valor={lead.participanteNome} />
            ) : (
              <p className="text-xs text-neutral-400">O titular é o próprio participante.</p>
            )}
          </Secao>

          {/* Programa + orçamento */}
          <Secao titulo="Programa escolhido">
            <Campo rotulo="Curso" valor={lead.programaNome || "—"} />
            <Campo rotulo="Escola" valor={lead.escola || "—"} />
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <MiniCampo rotulo="Início" valor={inicio ? fmtData(inicio) : "—"} />
              <MiniCampo rotulo="Duração" valor={weeks ? `${weeks} sem` : "—"} />
              <MiniCampo rotulo="Acomodação" valor={accom ? (accomTipo || "sim") : "não"} />
              <MiniCampo rotulo="Seguro" valor={seguro ? "sim" : "não"} />
            </div>
          </Secao>

          {/* Snapshot do orçamento (valores da cotação do dia em que o lead entrou) */}
          {programas.length > 0 ? (
            <Secao titulo="Orçamento no momento do pedido">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-neutral-400">
                      <th className="py-1 font-medium">Curso</th>
                      <th className="py-1 text-right font-medium">Total (moeda)</th>
                      <th className="py-1 text-right font-medium">≈ em R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programas.map((p, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="py-1.5 text-neutral-700">
                          {p.curso || "—"}
                          {p.escola ? <span className="text-neutral-400"> · {p.escola}</span> : null}
                        </td>
                        <td className="py-1.5 text-right text-neutral-700">
                          {typeof p.totalMoeda === "number" && p.moeda ? fmtMoeda(p.totalMoeda, p.moeda) : "—"}
                        </td>
                        <td className="py-1.5 text-right font-medium text-brand">
                          {typeof p.totalBRL === "number" ? fmtBRL(p.totalBRL) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Valores registrados na cotação do dia do pedido — apenas referência. A cotação definitiva é feita ao converter em cliente.
              </p>
            </Secao>
          ) : null}

          {/* Aceite dos termos (LGPD) */}
          <Secao titulo="Aceite dos termos">
            {aceite?.aceito ? (
              <p className="text-sm text-neutral-700">
                <span className="font-medium text-emerald-700">Aceito</span>
                {aceite.em ? ` em ${new Date(aceite.em).toLocaleString("pt-BR")}` : ""}
                {aceite.ip ? <span className="text-neutral-400"> · IP {aceite.ip}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-neutral-500">Sem registro de aceite.</p>
            )}
          </Secao>
        </div>

        {/* Coluna de ações */}
        <div className="space-y-4">
          <Secao titulo="Próxima ação">
            <p className="text-xs text-neutral-500">
              Feche o negócio criando a conta do cliente (titular verificado) e a cotação — o acesso à Área do Cliente
              é enviado nessa etapa.
            </p>
            <button
              type="button"
              disabled
              title="Próxima etapa da entrega"
              className="mt-3 flex w-full cursor-default items-center justify-center gap-2 rounded-xl bg-brand/40 px-4 py-2.5 text-sm font-medium text-white"
            >
              Converter em cliente + cotação
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">em breve</span>
            </button>
          </Secao>

          <Secao titulo="Mover no funil">
            {proximos.length > 0 ? (
              <div className="flex flex-col gap-2">
                {proximos.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => mudarStatus(s)}
                    disabled={salvando !== null}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
                  >
                    {salvando === s ? "Salvando..." : `Marcar como “${STATUS_LEAD_LABEL[s]}”`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">Sem transições disponíveis a partir deste status.</p>
            )}
          </Secao>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{titulo}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-neutral-500">{rotulo}</span>
      <span className="text-right font-medium text-brand">{valor}</span>
    </div>
  );
}

function MiniCampo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{rotulo}</p>
      <p className="text-sm font-medium text-brand">{valor}</p>
    </div>
  );
}
