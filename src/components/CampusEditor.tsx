"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAMPUS_STATUSES, MOEDAS_COMUNS, FUSOS_COMUNS, type Falha } from "@/lib/campus";

// Editor de campus (unidade/escola) do fornecedor — hub, aba "Meus Campi".
// Client component: monta o corpo cru e chama POST /api/admin/suppliers/[id]/campus
// (criar) ou PUT .../campus/[campusId] (editar). A validacao de verdade acontece
// no servidor (motor puro src/lib/campus.ts); aqui destacamos as falhas por campo.

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", inactive: "Inativo" };

export type CampusInicial = {
  id?: string;
  name?: string;
  country_code?: string;
  region?: string | null;
  city?: string;
  address?: string | null;
  postal_code?: string | null;
  timezone?: string;
  base_currency?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  status?: string;
};

export default function CampusEditor({
  supplierId,
  voltarHref,
  inicial,
}: {
  supplierId: string;
  voltarHref: string; // para onde voltar apos salvar/arquivar
  inicial?: CampusInicial;
}) {
  const router = useRouter();
  const edicao = !!inicial?.id;

  const [campo, setCampo] = useState<Record<string, string>>({
    name: inicial?.name ?? "",
    country_code: inicial?.country_code ?? "",
    region: inicial?.region ?? "",
    city: inicial?.city ?? "",
    address: inicial?.address ?? "",
    postal_code: inicial?.postal_code ?? "",
    timezone: inicial?.timezone ?? "UTC",
    base_currency: inicial?.base_currency ?? "",
    phone: inicial?.phone ?? "",
    email: inicial?.email ?? "",
    website: inicial?.website ?? "",
    status: inicial?.status ?? "active",
  });
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const set = (k: string, v: string) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (nome: string) => falhas.find((f) => f.campo === nome)?.erro;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setFalhas([]);
    try {
      const url = edicao
        ? `/api/admin/suppliers/${supplierId}/campus/${inicial!.id}`
        : `/api/admin/suppliers/${supplierId}/campus`;
      const resp = await fetch(url, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campo),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar o campus.");
        setSalvando(false);
        return;
      }
      router.push(voltarHref);
      router.refresh();
    } catch {
      setErroGeral("Falha de rede ao salvar.");
      setSalvando(false);
    }
  }

  async function arquivar() {
    if (!edicao) return;
    if (!window.confirm("Arquivar este campus? Ele sai das listas (produtos e preços ligados a ele são mantidos).")) return;
    setSalvando(true);
    setErroGeral(null);
    try {
      const resp = await fetch(`/api/admin/suppliers/${supplierId}/campus/${inicial!.id}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErroGeral(json?.error?.message ?? "Não foi possível arquivar o campus.");
        setSalvando(false);
        return;
      }
      router.push(voltarHref);
      router.refresh();
    } catch {
      setErroGeral("Falha de rede ao arquivar.");
      setSalvando(false);
    }
  }

  const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

  return (
    <form onSubmit={salvar} className="space-y-6">
      {erroGeral ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-serif text-base text-brand">Identificação</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome do campus" erro={falhaDe("name")} className="sm:col-span-2">
            <input className={inp} value={campo.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Connect International School — Toronto" />
          </Campo>
          <Campo label="Status" erro={falhaDe("status")}>
            <select className={inp} value={campo.status} onChange={(e) => set("status", e.target.value)}>
              {CAMPUS_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
              ))}
            </select>
            <Ajuda>Só pode existir um campus em rascunho por fornecedor.</Ajuda>
          </Campo>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-serif text-base text-brand">Localização</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cidade" erro={falhaDe("city")}>
            <input className={inp} value={campo.city} onChange={(e) => set("city", e.target.value)} placeholder="Toronto" />
          </Campo>
          <Campo label="País (ISO-2)" erro={falhaDe("country_code")}>
            <input className={inp} value={campo.country_code} onChange={(e) => set("country_code", e.target.value.toUpperCase())} placeholder="CA" maxLength={2} />
          </Campo>
          <Campo label="Região / Estado / Província" erro={falhaDe("region")}>
            <input className={inp} value={campo.region} onChange={(e) => set("region", e.target.value)} placeholder="ON" />
          </Campo>
          <Campo label="CEP / Postal code" erro={falhaDe("postal_code")}>
            <input className={inp} value={campo.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </Campo>
          <Campo label="Endereço" erro={falhaDe("address")} className="sm:col-span-2">
            <input className={inp} value={campo.address} onChange={(e) => set("address", e.target.value)} />
          </Campo>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-serif text-base text-brand">Operação</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Moeda base (ISO-3)" erro={falhaDe("base_currency")}>
            <input className={inp} list="campus-moedas" value={campo.base_currency} onChange={(e) => set("base_currency", e.target.value.toUpperCase())} placeholder="CAD" maxLength={3} />
            <datalist id="campus-moedas">
              {MOEDAS_COMUNS.map((m) => <option key={m} value={m} />)}
            </datalist>
            <Ajuda>Moeda em que os preços deste campus são cotados.</Ajuda>
          </Campo>
          <Campo label="Fuso horário (IANA)" erro={falhaDe("timezone")}>
            <input className={inp} list="campus-fusos" value={campo.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/Toronto" />
            <datalist id="campus-fusos">
              {FUSOS_COMUNS.map((f) => <option key={f} value={f} />)}
            </datalist>
          </Campo>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 font-serif text-base text-brand">Contato</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="E-mail" erro={falhaDe("email")}>
            <input className={inp} type="email" value={campo.email} onChange={(e) => set("email", e.target.value)} />
          </Campo>
          <Campo label="Telefone" erro={falhaDe("phone")}>
            <input className={inp} value={campo.phone} onChange={(e) => set("phone", e.target.value)} />
          </Campo>
          <Campo label="Site" erro={falhaDe("website")}>
            <input className={inp} value={campo.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </Campo>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
        >
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar campus"}
        </button>
        <a href={voltarHref} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
          Cancelar
        </a>
        {edicao ? (
          <button
            type="button"
            onClick={arquivar}
            disabled={salvando}
            className="ml-auto rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:border-red-400 hover:text-red-600 disabled:opacity-60"
          >
            Arquivar campus
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Campo({ label, erro, className, children }: { label: string; erro?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-neutral-600">{label}</label>
      {children}
      {erro ? <p className="mt-1 text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}

function Ajuda({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-neutral-400">{children}</p>;
}
