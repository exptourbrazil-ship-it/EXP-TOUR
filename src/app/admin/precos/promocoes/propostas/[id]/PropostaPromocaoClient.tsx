"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIPOS = [
  ["percent_off", "Desconto %"],
  ["fixed_off", "Desconto fixo"],
  ["free_units", "Unidades grátis"],
  ["waive_fee", "Isentar taxa"],
  ["free_product", "Produto grátis"],
  ["override_price", "Preço promocional"],
] as const;
const APLICA = [
  ["tuition", "Curso"],
  ["accommodation", "Acomodação"],
  ["insurance", "Seguro"],
  ["fees", "Taxas"],
  ["total", "Total"],
  ["specific_product", "Produto específico"],
] as const;

type Falha = { campo: string; erro: string };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

// Form de revisao da proposta (F3.3): campos prefixados com o que a IA propos; o admin
// ajusta e PUBLICA (cria promocao ativa) ou recusa com motivo. Falhas de campo vem da
// validacao do servidor (validarPromocao) e aparecem junto ao campo.
export default function PropostaPromocaoClient({
  id,
  entrada,
  campi,
  produtos,
}: {
  id: string;
  entrada: Record<string, unknown>;
  campi: Array<{ id: string; nome: string }>;
  produtos: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: str(entrada.name),
    promo_type: str(entrada.promo_type),
    value: str(entrada.value),
    free_units_semantics: str(entrada.free_units_semantics) || "discount_on_booked",
    applies_to: str(entrada.applies_to) || "tuition",
    applies_to_ref_id: str(entrada.applies_to_ref_id),
    min_quantity: str(entrada.min_quantity),
    max_quantity: str(entrada.max_quantity),
    max_discount_amount: str(entrada.max_discount_amount),
    is_stackable: entrada.is_stackable === true,
    booking_from: str(entrada.booking_from),
    booking_until: str(entrada.booking_until),
    travel_from: str(entrada.travel_from),
    travel_until: str(entrada.travel_until),
    campus_id: str(entrada.campus_id),
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [formRecusa, setFormRecusa] = useState(false);
  const [motivo, setMotivo] = useState("");

  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const falhaDe = (campo: string) => falhas.find((x) => x.campo === campo)?.erro;
  const precisaValor = ["percent_off", "fixed_off", "free_units", "override_price"].includes(f.promo_type);

  async function publicar() {
    if (!confirm("Publicar esta promoção? Ela passa a valer nas cotações imediatamente (até o prazo de reserva).")) return;
    setOcupado(true);
    setErro(null);
    setFalhas([]);
    try {
      const ajustes = {
        name: f.name,
        promo_type: f.promo_type,
        value: f.value === "" ? null : Number(f.value.replace(",", ".")),
        free_units_semantics: f.promo_type === "free_units" ? f.free_units_semantics : null,
        applies_to: f.applies_to,
        applies_to_ref_id: f.applies_to === "specific_product" ? f.applies_to_ref_id || null : null,
        min_quantity: f.min_quantity === "" ? null : Number(f.min_quantity),
        max_quantity: f.max_quantity === "" ? null : Number(f.max_quantity),
        max_discount_amount: f.max_discount_amount === "" ? null : Number(f.max_discount_amount.replace(",", ".")),
        is_stackable: f.is_stackable,
        booking_from: f.booking_from || null,
        booking_until: f.booking_until || null,
        travel_from: f.travel_from || null,
        travel_until: f.travel_until || null,
        campus_id: f.campus_id || null,
      };
      const res = await fetch("/api/admin/promotion-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar", id, ajustes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao publicar.");
        setFalhas(Array.isArray(json.falhas) ? json.falhas : []);
        return;
      }
      setOk(`Publicada: ${json.nome}.`);
      setTimeout(() => router.push("/admin/precos/promocoes"), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function recusar() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/promotion-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "rejeitar", id, motivo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao recusar.");
        return;
      }
      setOk("Proposta recusada.");
      setTimeout(() => router.push("/admin/precos/promocoes"), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm";
  const Campo = ({ campo, label, children }: { campo: string; label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
      {falhaDe(campo) ? <span className="mt-0.5 block text-xs text-red-600">{falhaDe(campo)}</span> : null}
    </label>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 font-serif text-lg text-brand">Ajustar e publicar</h2>
      {erro ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">{ok}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo campo="name" label="Nome da promoção">
            <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Campo>
        </div>
        <Campo campo="promo_type" label="Tipo">
          <select className={input} value={f.promo_type} onChange={(e) => set("promo_type", e.target.value)}>
            <option value="">— escolha —</option>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo campo="value" label={precisaValor ? "Valor (obrigatório)" : "Valor (não se aplica)"}>
          <input className={input} inputMode="decimal" value={f.value} disabled={!precisaValor} onChange={(e) => set("value", e.target.value)} />
        </Campo>
        {f.promo_type === "free_units" ? (
          <Campo campo="free_units_semantics" label="Semântica das unidades grátis">
            <select className={input} value={f.free_units_semantics} onChange={(e) => set("free_units_semantics", e.target.value)}>
              <option value="discount_on_booked">Desconto nas semanas reservadas</option>
              <option value="bonus_on_top">Semanas extras (bônus)</option>
            </select>
          </Campo>
        ) : null}
        <Campo campo="applies_to" label="Aplica a">
          <select className={input} value={f.applies_to} onChange={(e) => set("applies_to", e.target.value)}>
            {APLICA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        {f.applies_to === "specific_product" ? (
          <Campo campo="applies_to_ref_id" label="Produto alvo">
            <select className={input} value={f.applies_to_ref_id} onChange={(e) => set("applies_to_ref_id", e.target.value)}>
              <option value="">— escolha —</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        ) : null}
        <Campo campo="campus_id" label="Campus (opcional)">
          <select className={input} value={f.campus_id} onChange={(e) => set("campus_id", e.target.value)}>
            <option value="">Todos os campi do fornecedor</option>
            {campi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo campo="min_quantity" label="Mínimo (semanas)">
          <input className={input} inputMode="numeric" value={f.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} />
        </Campo>
        {/* Sem o máximo, uma promoção de FAIXA lida da price list ("de 12 a 23
            semanas") virava "a partir de 12" ao ser aprovada. */}
        <Campo campo="max_quantity" label="Máximo (semanas)">
          <input className={input} inputMode="numeric" value={f.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} />
        </Campo>
        <Campo campo="booking_from" label="Reservar a partir de">
          <input className={input} type="date" value={f.booking_from} onChange={(e) => set("booking_from", e.target.value)} />
        </Campo>
        <Campo campo="booking_until" label="Reservar até (prazo — aparece no orçamento)">
          <input className={input} type="date" value={f.booking_until} onChange={(e) => set("booking_until", e.target.value)} />
        </Campo>
        <Campo campo="travel_from" label="Viagem a partir de">
          <input className={input} type="date" value={f.travel_from} onChange={(e) => set("travel_from", e.target.value)} />
        </Campo>
        <Campo campo="travel_until" label="Viagem até">
          <input className={input} type="date" value={f.travel_until} onChange={(e) => set("travel_until", e.target.value)} />
        </Campo>
        <Campo campo="max_discount_amount" label="Teto do desconto (opcional)">
          <input className={input} inputMode="decimal" value={f.max_discount_amount} onChange={(e) => set("max_discount_amount", e.target.value)} />
        </Campo>
        <label className="flex items-center gap-2 pt-5 text-sm text-neutral-700">
          <input type="checkbox" checked={f.is_stackable} onChange={(e) => set("is_stackable", e.target.checked)} />
          Acumulável com outras promoções
        </label>
      </div>

      {!formRecusa ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={publicar} disabled={ocupado} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {ocupado ? "Publicando…" : "Publicar promoção"}
          </button>
          <button type="button" onClick={() => { setErro(null); setFormRecusa(true); }} disabled={ocupado} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60">
            Recusar proposta
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-xs font-medium text-neutral-600">Motivo da recusa (fica no histórico)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={input} placeholder="Ex.: promoção já expirou; não é oferta, é preço de tabela…" />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={recusar} disabled={ocupado || !motivo.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Confirmar recusa
            </button>
            <button type="button" onClick={() => setFormRecusa(false)} disabled={ocupado} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
