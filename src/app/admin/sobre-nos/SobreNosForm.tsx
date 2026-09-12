"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigMarca } from "@/lib/tenant-config-service";

const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

// Form do "Sobre nós" + contato. Salva via POST /api/admin/config/sobre-nos.
export default function SobreNosForm({ inicial }: { inicial: ConfigMarca }) {
  const router = useRouter();
  const [aboutUsHtml, setAbout] = useState(inicial.aboutUsHtml);
  const [website, setWebsite] = useState(inicial.website);
  const [address, setAddress] = useState(inicial.address);
  const [email, setEmail] = useState(inicial.email);
  const [phone, setPhone] = useState(inicial.phone);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setOk(false);
    setErro(null);
    try {
      const r = await fetch("/api/admin/config/sobre-nos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aboutUsHtml, website, address, email, phone }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setErro(j?.erro || "Não foi possível salvar.");
      else { setOk(true); router.refresh(); }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Salvo.</div> : null}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <label className={lbl}>Texto institucional (HTML simples: parágrafos, negrito, listas)</label>
        <textarea value={aboutUsHtml} onChange={(e) => { setAbout(e.target.value); setOk(false); }} rows={8} className={inp} placeholder="<p>Quem somos, nossa missão…</p>" />
        <p className="mt-1 text-[11px] text-neutral-400">Aparece no topo da aba &ldquo;Sobre nós&rdquo;. Deixe em branco para mostrar só o contato e o consultor.</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Contato</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Site</label><input value={website} onChange={(e) => { setWebsite(e.target.value); setOk(false); }} className={inp} placeholder="www.suaagencia.com.br" /></div>
          <div><label className={lbl}>E-mail</label><input value={email} onChange={(e) => { setEmail(e.target.value); setOk(false); }} type="email" className={inp} placeholder="contato@suaagencia.com.br" /></div>
          <div><label className={lbl}>Telefone</label><input value={phone} onChange={(e) => { setPhone(e.target.value); setOk(false); }} className={inp} placeholder="(11) 99999-9999" /></div>
          <div><label className={lbl}>Endereço</label><input value={address} onChange={(e) => { setAddress(e.target.value); setOk(false); }} className={inp} placeholder="Rua…, nº — Cidade/UF" /></div>
        </div>
      </div>

      <button type="button" onClick={salvar} disabled={salvando}
        className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-cream transition hover:opacity-90 disabled:opacity-60">
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
