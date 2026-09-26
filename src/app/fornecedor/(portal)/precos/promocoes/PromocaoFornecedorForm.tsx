"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";

// Form de proposta de promoção do fornecedor — criação e edição. A tabela
// promotion_submission não tem status 'draft' (só pending_admin/processing/
// approved/rejected): "Enviar proposta" já grava pending_admin (mesma fila do
// admin); enquanto ninguém revisou (status ainda pending_admin), a escola pode
// voltar aqui e corrigir os campos. Validação real é sempre no servidor
// (validarPromocao) — falhas por campo aparecem aqui.

type Falha = { campo: string; erro: string };
type Opcao = { id: string; nome: string };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const EXIGEM_VALUE = ["percent_off", "fixed_off", "free_units", "override_price"];

export default function PromocaoFornecedorForm({
  id,
  status,
  entradaInicial,
  campi,
  produtos,
  fees,
  language,
}: {
  id?: string;
  status?: string;
  entradaInicial?: Record<string, unknown>;
  campi: Opcao[];
  produtos: Opcao[];
  fees: Opcao[];
  language: string;
}) {
  const router = useRouter();
  const p = entradaInicial ?? {};
  const edicao = !!id;
  const editavel = !edicao || status === "pending_admin";

  const T = t(language, {
    pt: {
      tipos: {
        percent_off: "Desconto %",
        fixed_off: "Desconto fixo",
        free_units: "Unidades grátis",
        waive_fee: "Isentar taxa",
        free_product: "Produto grátis",
        override_price: "Preço promocional",
      } as Record<string, string>,
      aplica: {
        tuition: "Curso",
        accommodation: "Acomodação",
        insurance: "Seguro",
        fees: "Taxas",
        total: "Total",
        specific_fee: "Taxa específica",
        specific_product: "Curso específico",
      } as Record<string, string>,
      semantica: { discount_on_booked: "Desconto nas semanas reservadas", bonus_on_top: "Semanas extras (bônus)" } as Record<string, string>,
      nome: "Nome da promoção",
      nomePlaceholder: "Ex.: Early bird 2027",
      tipo: "Tipo de promoção",
      valor: "Valor",
      valorObrigatorio: "Valor (obrigatório)",
      valorNaoSeAplica: "Valor (não se aplica a este tipo)",
      semanticaLabel: "Semântica das unidades grátis",
      tierLabel: "Cobrar pela faixa de (semanas, opcional)",
      aplicaA: "Aplica-se a",
      cursoAlvo: "Curso alvo",
      taxaAlvo: "Taxa alvo",
      escolha: "— escolha —",
      campus: "Campus (opcional)",
      todosCampi: "Todos os campi",
      minimo: "Mínimo (semanas, opcional)",
      maximo: "Máximo (semanas, opcional)",
      teto: "Teto do desconto (opcional)",
      acumulavel: "Acumulável com outras promoções",
      reservaDe: "Reservar a partir de",
      reservaAte: "Reservar até (prazo)",
      viagemDe: "Viagem a partir de",
      viagemAte: "Viagem até",
      enviar: "Enviar proposta",
      enviando: "Enviando…",
      salvar: "Salvar alterações",
      salvando: "Salvando…",
      cancelar: "Cancelar",
      introCriar: "Sua proposta é enviada direto para a EXP Tour revisar e publicar. Você ainda pode corrigi-la enquanto ninguém tiver começado a revisão.",
      naoEditavel: "Esta proposta não está mais editável (já está em análise ou foi decidida).",
      erroRede: "Erro de rede. Tente novamente.",
      erroGenerico: "Não foi possível salvar.",
      ok: "Proposta salva.",
      okCriar: "Proposta enviada.",
    },
    en: {
      tipos: {
        percent_off: "Percent off",
        fixed_off: "Fixed amount off",
        free_units: "Free units",
        waive_fee: "Waive fee",
        free_product: "Free product",
        override_price: "Promotional price",
      } as Record<string, string>,
      aplica: {
        tuition: "Course",
        accommodation: "Accommodation",
        insurance: "Insurance",
        fees: "Fees",
        total: "Total",
        specific_fee: "Specific fee",
        specific_product: "Specific course",
      } as Record<string, string>,
      semantica: { discount_on_booked: "Discount on booked weeks", bonus_on_top: "Extra weeks (bonus)" } as Record<string, string>,
      nome: "Promotion name",
      nomePlaceholder: "E.g.: Early bird 2027",
      tipo: "Promotion type",
      valor: "Value",
      valorObrigatorio: "Value (required)",
      valorNaoSeAplica: "Value (not used for this type)",
      semanticaLabel: "Free units semantics",
      tierLabel: "Charge at the tier of (weeks, optional)",
      aplicaA: "Applies to",
      cursoAlvo: "Target course",
      taxaAlvo: "Target fee",
      escolha: "— choose —",
      campus: "Campus (optional)",
      todosCampi: "All campuses",
      minimo: "Minimum (weeks, optional)",
      maximo: "Maximum (weeks, optional)",
      teto: "Discount cap (optional)",
      acumulavel: "Stackable with other promotions",
      reservaDe: "Bookable from",
      reservaAte: "Book by (deadline)",
      viagemDe: "Travel from",
      viagemAte: "Travel until",
      enviar: "Submit proposal",
      enviando: "Submitting…",
      salvar: "Save changes",
      salvando: "Saving…",
      cancelar: "Cancel",
      introCriar: "Your proposal goes straight to EXP Tour for review and publishing. You can still fix it as long as no one has started reviewing it.",
      naoEditavel: "This proposal is no longer editable (it is under review or has been decided).",
      erroRede: "Connection error. Please try again.",
      erroGenerico: "Could not save.",
      ok: "Proposal saved.",
      okCriar: "Proposal submitted.",
    },
  });

  const [campo, setCampo] = useState<Record<string, string | boolean>>({
    name: str(p.name),
    promo_type: str(p.promo_type) || "percent_off",
    value: p.value != null ? String(p.value) : "",
    free_units_semantics: str(p.free_units_semantics) || "discount_on_booked",
    free_units_tier_quantity: p.free_units_tier_quantity != null ? String(p.free_units_tier_quantity) : "",
    applies_to: str(p.applies_to) || "tuition",
    applies_to_ref_id: str(p.applies_to_ref_id),
    campus_id: str(p.campus_id),
    min_quantity: p.min_quantity != null ? String(p.min_quantity) : "",
    max_quantity: p.max_quantity != null ? String(p.max_quantity) : "",
    max_discount_amount: p.max_discount_amount != null ? String(p.max_discount_amount) : "",
    is_stackable: p.is_stackable === true,
    booking_from: str(p.booking_from),
    booking_until: str(p.booking_until),
    travel_from: str(p.travel_from),
    travel_until: str(p.travel_until),
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [ok, setOk] = useState<string | null>(null);

  const set = (k: string, v: string | boolean) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (c: string) => falhas.find((x) => x.campo === c)?.erro;
  const exigeValor = EXIGEM_VALUE.includes(String(campo.promo_type));
  const exigeSemantica = campo.promo_type === "free_units";
  const exigeRef = campo.applies_to === "specific_product" || campo.applies_to === "specific_fee";

  function montarEntrada() {
    const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
    return {
      name: campo.name,
      promo_type: campo.promo_type,
      value: exigeValor ? num(String(campo.value)) : null,
      free_units_semantics: exigeSemantica ? campo.free_units_semantics : null,
      free_units_tier_quantity: exigeSemantica && campo.free_units_tier_quantity ? Number(campo.free_units_tier_quantity) : null,
      applies_to: campo.applies_to,
      applies_to_ref_id: exigeRef ? campo.applies_to_ref_id || null : null,
      campus_id: campo.campus_id || null,
      min_quantity: campo.min_quantity === "" ? null : Number(campo.min_quantity),
      max_quantity: campo.max_quantity === "" ? null : Number(campo.max_quantity),
      max_discount_amount: num(String(campo.max_discount_amount)),
      is_stackable: !!campo.is_stackable,
      booking_from: campo.booking_from || null,
      booking_until: campo.booking_until || null,
      travel_from: campo.travel_from || null,
      travel_until: campo.travel_until || null,
    };
  }

  async function salvar() {
    setOcupado(true);
    setErro(null);
    setFalhas([]);
    setOk(null);
    try {
      const url = edicao ? `/api/fornecedor/promocoes/${id}` : "/api/fornecedor/promocoes";
      const res = await fetch(url, {
        method: edicao ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: montarEntrada() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || T.erroGenerico);
        setFalhas(Array.isArray(json.falhas) ? json.falhas : []);
        return;
      }
      if (edicao) {
        setOk(T.ok);
        router.refresh();
      } else {
        router.push(`/fornecedor/precos/promocoes/${json.id}`);
      }
    } catch {
      setErro(T.erroRede);
    } finally {
      setOcupado(false);
    }
  }

  const input = inp();
  const Campo = ({ campoNome, label, children }: { campoNome: string; label: string; children: React.ReactNode }) => (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: "var(--p-muted)", fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
      {falhaDe(campoNome) ? <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#b91c1c" }}>{falhaDe(campoNome)}</span> : null}
    </label>
  );

  if (!editavel) {
    return (
      <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "var(--p-accent-soft)", color: "var(--p-accent-ink)", padding: 14, fontSize: 13 }}>
        {T.naoEditavel}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16 }}>
      {!edicao ? <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 14px" }}>{T.introCriar}</p> : null}
      {erro ? <div style={{ marginBottom: 12, borderRadius: 10, padding: "10px 14px", fontSize: 13, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c" }}>{erro}</div> : null}
      {ok ? <div style={{ marginBottom: 12, borderRadius: 10, padding: "10px 14px", fontSize: 13, border: "1px solid var(--p-success-soft)", background: "var(--p-success-soft)", color: "var(--p-success-ink)" }}>{ok}</div> : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo campoNome="name" label={T.nome}>
            <input style={input} value={String(campo.name)} placeholder={T.nomePlaceholder} onChange={(e) => set("name", e.target.value)} />
          </Campo>
        </div>

        <Campo campoNome="promo_type" label={T.tipo}>
          <select style={input} value={String(campo.promo_type)} onChange={(e) => set("promo_type", e.target.value)}>
            {Object.entries(T.tipos).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Campo>

        <Campo campoNome="value" label={exigeValor ? T.valorObrigatorio : T.valorNaoSeAplica}>
          <input style={input} inputMode="decimal" disabled={!exigeValor} value={String(campo.value)} onChange={(e) => set("value", e.target.value)} />
        </Campo>

        {exigeSemantica ? (
          <Campo campoNome="free_units_semantics" label={T.semanticaLabel}>
            <select style={input} value={String(campo.free_units_semantics)} onChange={(e) => set("free_units_semantics", e.target.value)}>
              {Object.entries(T.semantica).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Campo>
        ) : null}
        {exigeSemantica ? (
          <Campo campoNome="free_units_tier_quantity" label={T.tierLabel}>
            <input style={input} inputMode="numeric" value={String(campo.free_units_tier_quantity)} onChange={(e) => set("free_units_tier_quantity", e.target.value)} />
          </Campo>
        ) : null}

        <Campo campoNome="applies_to" label={T.aplicaA}>
          <select style={input} value={String(campo.applies_to)} onChange={(e) => { set("applies_to", e.target.value); set("applies_to_ref_id", ""); }}>
            {Object.entries(T.aplica).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Campo>

        {exigeRef ? (
          <Campo campoNome="applies_to_ref_id" label={campo.applies_to === "specific_fee" ? T.taxaAlvo : T.cursoAlvo}>
            <select style={input} value={String(campo.applies_to_ref_id)} onChange={(e) => set("applies_to_ref_id", e.target.value)}>
              <option value="">{T.escolha}</option>
              {(campo.applies_to === "specific_fee" ? fees : produtos).map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </select>
          </Campo>
        ) : null}

        <Campo campoNome="campus_id" label={T.campus}>
          <select style={input} value={String(campo.campus_id)} onChange={(e) => set("campus_id", e.target.value)}>
            <option value="">{T.todosCampi}</option>
            {campi.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Campo>

        <Campo campoNome="min_quantity" label={T.minimo}>
          <input style={input} inputMode="numeric" value={String(campo.min_quantity)} onChange={(e) => set("min_quantity", e.target.value)} />
        </Campo>
        <Campo campoNome="max_quantity" label={T.maximo}>
          <input style={input} inputMode="numeric" value={String(campo.max_quantity)} onChange={(e) => set("max_quantity", e.target.value)} />
        </Campo>

        <Campo campoNome="booking_from" label={T.reservaDe}>
          <input style={input} type="date" value={String(campo.booking_from)} onChange={(e) => set("booking_from", e.target.value)} />
        </Campo>
        <Campo campoNome="booking_until" label={T.reservaAte}>
          <input style={input} type="date" value={String(campo.booking_until)} onChange={(e) => set("booking_until", e.target.value)} />
        </Campo>
        <Campo campoNome="travel_from" label={T.viagemDe}>
          <input style={input} type="date" value={String(campo.travel_from)} onChange={(e) => set("travel_from", e.target.value)} />
        </Campo>
        <Campo campoNome="travel_until" label={T.viagemAte}>
          <input style={input} type="date" value={String(campo.travel_until)} onChange={(e) => set("travel_until", e.target.value)} />
        </Campo>

        <Campo campoNome="max_discount_amount" label={T.teto}>
          <input style={input} inputMode="decimal" value={String(campo.max_discount_amount)} onChange={(e) => set("max_discount_amount", e.target.value)} />
        </Campo>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-ink)", paddingTop: 20 }}>
          <input type="checkbox" checked={!!campo.is_stackable} onChange={(e) => set("is_stackable", e.target.checked)} />
          {T.acumulavel}
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button type="button" onClick={salvar} disabled={ocupado} style={btnPrim(ocupado)}>
          {ocupado ? (edicao ? T.salvando : T.enviando) : edicao ? T.salvar : T.enviar}
        </button>
        <button type="button" onClick={() => router.push("/fornecedor/precos/promocoes")} style={btnSec(ocupado)}>
          {T.cancelar}
        </button>
      </div>
    </div>
  );
}

function inp(): React.CSSProperties {
  return { width: "100%", border: "1px solid var(--p-line)", borderRadius: 8, padding: "7px 9px", fontSize: 13, background: "#fff", color: "var(--p-ink)" };
}
function btnPrim(disabled: boolean): React.CSSProperties {
  return { background: "var(--p-cta)", color: "var(--p-cta-fg)", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 };
}
function btnSec(disabled: boolean): React.CSSProperties {
  return { background: "#fff", color: "var(--p-ink)", border: "1px solid var(--p-line)", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 };
}
