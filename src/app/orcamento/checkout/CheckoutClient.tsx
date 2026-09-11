"use client";

import { useState } from "react";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { montarLinkSuporteWhatsApp } from "@/lib/viagem";
import { montarOrcamento, converterBRL, type ProgramaOrcavel } from "@/lib/orcamento";
import { validarCpf, mascararCpf } from "@/lib/cpf";
import { fmtMoeda, fmtBRL, fmtData, labelSemanas, type ParamsOrcamento } from "../shared";

type Props = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>;
  params: ParamsOrcamento;
  numParcelas: number | null;
};

const BLUE = "var(--p-cta)";
const MIST = "var(--p-page)";

export default function CheckoutClient({ programas, cambio, params }: Props) {
  const brand = useTenantBrand();
  const marca = brand.email.brandName;
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opts = { weeks: params.weeks, accomOn: params.accom, accomType: params.accomTipo, insuranceOn: params.seguro };
  const linhas = programas.map((p) => {
    const o = montarOrcamento(p, opts);
    const vet = cambio[p.currency] || 0;
    return { p, o, brl: converterBRL(o.totalMoeda, vet), vet };
  });

  function encaminhar() {
    setErro(null);
    if (!nome.trim()) return setErro("Informe seu nome.");
    if (!validarCpf(cpf)) return setErro("Informe um CPF válido — é ele que cria e acessa sua conta na Área do Cliente.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro("Informe um e-mail válido.");
    if (!aceite) return setErro("É preciso aceitar os termos e condições para continuar.");

    const resumo = linhas
      .map((l) => `• ${l.p.courseName} — ${l.p.school} (${l.p.city}, ${l.p.country}), ${labelSemanas(params.weeks)}: ${l.vet > 0 ? fmtBRL(l.brl) : fmtMoeda(l.o.totalMoeda, l.o.currency)}`)
      .join("\n");
    const msg = `Quero encaminhar minha matrícula com a ${marca}.\n\nNome: ${nome}\nCPF: ${mascararCpf(cpf)}\nE-mail: ${email}${telefone ? `\nTelefone: ${telefone}` : ""}\nInício: ${fmtData(params.inicio)}\n\nPrograma(s):\n${resumo}\n\nLi e aceito os termos e condições.`;
    const base = montarLinkSuporteWhatsApp(brand.supportWhatsApp);
    const link = base + (base.includes("?") ? "&" : "?") + "text=" + encodeURIComponent(msg);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px", paddingBottom: 64 }}>
      <a href="javascript:history.back()" style={{ fontSize: 13, color: "var(--p-cta)", textDecoration: "none" }}>← Voltar ao orçamento</a>
      <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--p-ink)", marginTop: 6 }}>Encaminhar matrícula</h1>
      <p style={{ fontSize: 13, color: "var(--p-muted)" }}>Revise, preencha seus dados e aceite os termos. A equipe da {marca} dá sequência na sua inscrição.</p>

      {/* Resumo */}
      <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 18, marginTop: 16 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 8 }}>Programa(s) escolhido(s)</p>
        {linhas.map((l) => (
          <div key={l.p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid #F0F0EE" }}>
            <span style={{ fontSize: 13.5, color: "var(--p-ink)" }}>{l.p.courseName} <span style={{ color: "var(--p-muted)" }}>· {l.p.school}, {l.p.city}</span></span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--p-ink)", whiteSpace: "nowrap" }}>{l.vet > 0 ? fmtBRL(l.brl) : fmtMoeda(l.o.totalMoeda, l.o.currency)}</span>
          </div>
        ))}
        <p style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 8 }}>Início {fmtData(params.inicio)} · {labelSemanas(params.weeks)} · valores em reais pela cotação do dia.</p>
      </div>

      {/* Dados */}
      <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 18, marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={lbl}>Nome completo
          <input value={nome} onChange={(e) => setNome(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>CPF
          <input value={cpf} onChange={(e) => setCpf(mascararCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" style={inp} />
          <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 400 }}>É o CPF que cria e acessa sua conta na Área do Cliente.</span>
        </label>
        <label style={lbl}>E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} placeholder="voce@email.com" />
          <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 400 }}>Você recebe o código de acesso da Área do Cliente por aqui.</span>
        </label>
        <label style={lbl}>Telefone / WhatsApp (opcional)
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} style={inp} placeholder="(11) 99999-9999" />
        </label>
      </div>

      {/* Termos e condicoes */}
      <div style={{ background: MIST, borderRadius: 12, padding: 18, marginTop: 16 }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 8 }}>Termos e condições</p>
        <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.6, paddingRight: 8 }}>
          <p>1. O valor total em reais é uma <b>estimativa</b> pela cotação do dia (BACEN + IOF 3,5% + taxa de intermediação 5%) e só é confirmado na geração de cada cobrança PIX.</p>
          <p style={{ marginTop: 8 }}>2. A dívida do programa é registrada na moeda estrangeira do curso; o câmbio é aplicado a cada pagamento.</p>
          <p style={{ marginTop: 8 }}>3. Vagas, datas e preços das escolas estão sujeitos à confirmação e disponibilidade no momento da inscrição.</p>
          <p style={{ marginTop: 8 }}>4. As parcelas seguem a regra de vencimento: entrada no mês corrente e a última até 30 dias antes do início do programa.</p>
          <p style={{ marginTop: 8 }}>5. Ao encaminhar, você autoriza a {marca} a entrar em contato e a tratar seus dados para fins da inscrição, conforme a LGPD.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
          Li e aceito os termos e condições.
        </label>
      </div>

      {erro ? <p style={{ color: "#B8860B", fontSize: 13, marginTop: 12 }}>{erro}</p> : null}

      <button onClick={encaminhar} style={{ width: "100%", background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "14px 18px", fontSize: 15, fontWeight: 500, cursor: "pointer", marginTop: 16 }}>
        Confirmar e encaminhar matrícula
      </button>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--p-muted)", fontWeight: 500 };
const inp: React.CSSProperties = { border: "1px solid #DCDCE8", borderRadius: 6, padding: "9px 12px", fontSize: 13.5, background: "#fff", color: "var(--p-ink)", fontFamily: "var(--p-body)" };
