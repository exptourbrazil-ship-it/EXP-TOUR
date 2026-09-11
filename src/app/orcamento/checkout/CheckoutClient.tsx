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

  const [participanteNome, setParticipanteNome] = useState("");
  const [titularDiferente, setTitularDiferente] = useState(false);
  const [titularNome, setTitularNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const opts = { weeks: params.weeks, accomOn: params.accom, accomType: params.accomTipo, insuranceOn: params.seguro };
  const linhas = programas.map((p) => {
    const o = montarOrcamento(p, opts);
    const vet = cambio[p.currency] || 0;
    return { p, o, brl: converterBRL(o.totalMoeda, vet), vet };
  });
  const principal = programas[0];

  async function encaminhar() {
    setErro(null);
    if (!participanteNome.trim()) return setErro("Informe o nome do participante (quem vai viajar).");
    if (titularDiferente && !titularNome.trim()) return setErro("Informe o nome do titular (responsável financeiro).");
    if (!validarCpf(cpf)) return setErro("Informe um CPF válido — é ele que cria e acessa a conta na Área do Cliente.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro("Informe um e-mail válido.");
    if (!aceite) return setErro("É preciso aceitar os termos e condições para continuar.");

    const titularNomeEfetivo = titularDiferente ? titularNome.trim() : participanteNome.trim();
    setEnviando(true);
    try {
      const resp = await fetch("/api/orcamento/matricula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titularNome: titularNomeEfetivo,
          cpf,
          email,
          telefone,
          participanteNome: titularDiferente ? participanteNome.trim() : null,
          aceite: true,
          programaId: principal?.id,
          programaNome: principal?.courseName,
          escola: principal ? `${principal.school} — ${principal.city}, ${principal.country}` : null,
          params: {
            weeks: params.weeks, inicio: params.inicio, accom: params.accom, accomTipo: params.accomTipo, seguro: params.seguro,
            programas: linhas.map((l) => ({ id: l.p.id, curso: l.p.courseName, escola: l.p.school, moeda: l.o.currency, totalMoeda: l.o.totalMoeda, totalBRL: l.brl })),
          },
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json.erro || "Não foi possível encaminhar a matrícula.");
      } else {
        setEnviado(true);
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    const wa = montarLinkSuporteWhatsApp(brand.supportWhatsApp);
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 16, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--p-ink)", marginTop: 8 }}>Pedido de matrícula recebido!</h1>
          <p style={{ fontSize: 14, color: "var(--p-muted)", lineHeight: 1.6, marginTop: 10 }}>
            A equipe da {marca} vai confirmar sua inscrição e criar o seu acesso à Área do Cliente — o código chega no
            e-mail <b>{email}</b>. Por segurança, a conta é ativada só depois dessa confirmação.
          </p>
          <a href={wa} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 20, background: BLUE, color: "#fff", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
            Falar com a {marca} agora
          </a>
          <p style={{ marginTop: 16 }}><a href="/orcamento" style={{ fontSize: 13, color: BLUE }}>Voltar ao orçamento</a></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px", paddingBottom: 64 }}>
      <a href="/orcamento" style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}>← Voltar ao orçamento</a>
      <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--p-ink)", marginTop: 6 }}>Encaminhar matrícula</h1>
      <p style={{ fontSize: 13, color: "var(--p-muted)" }}>Revise, preencha os dados e aceite os termos. A equipe da {marca} dá sequência na inscrição.</p>

      {/* Resumo */}
      <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 18, marginTop: 16 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 8 }}>Programa</p>
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
        <label style={lbl}>Nome do participante (quem vai viajar)
          <input value={participanteNome} onChange={(e) => setParticipanteNome(e.target.value)} style={inp} />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          <input type="checkbox" checked={titularDiferente} onChange={(e) => setTitularDiferente(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
          O titular (responsável financeiro/conta) é outra pessoa
        </label>

        {titularDiferente ? (
          <label style={lbl}>Nome do titular (responsável financeiro)
            <input value={titularNome} onChange={(e) => setTitularNome(e.target.value)} style={inp} />
          </label>
        ) : null}

        <div style={{ borderTop: "1px solid #F0F0EE", paddingTop: 12, marginTop: 2 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 8 }}>
            Dados do titular {titularDiferente ? "(responsável)" : "(quem vai viajar)"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={lbl}>CPF do titular
              <input value={cpf} onChange={(e) => setCpf(mascararCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" style={inp} />
              <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 400 }}>É o CPF que cria e acessa a conta na Área do Cliente.</span>
            </label>
            <label style={lbl}>E-mail do titular
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} placeholder="voce@email.com" />
              <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 400 }}>O código de acesso da Área do Cliente vai para este e-mail.</span>
            </label>
            <label style={lbl}>Telefone / WhatsApp (opcional)
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} style={inp} placeholder="(11) 99999-9999" />
            </label>
          </div>
        </div>
      </div>

      {/* Termos e condicoes */}
      <div style={{ background: MIST, borderRadius: 12, padding: 18, marginTop: 16 }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 8 }}>Termos e condições</p>
        <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.6, paddingRight: 8 }}>
          <p>1. O valor total em reais é uma <b>estimativa</b> pela cotação do dia (BACEN + IOF 3,5% + taxa de intermediação 5%) e só é confirmado na geração de cada cobrança PIX.</p>
          <p style={{ marginTop: 8 }}>2. A dívida do programa é registrada na moeda estrangeira do curso; o câmbio é aplicado a cada pagamento.</p>
          <p style={{ marginTop: 8 }}>3. Vagas, datas e preços das escolas estão sujeitos à confirmação e disponibilidade no momento da inscrição.</p>
          <p style={{ marginTop: 8 }}>4. As parcelas seguem a regra de vencimento: entrada no mês corrente e a última até 30 dias antes do início do programa.</p>
          <p style={{ marginTop: 8 }}>5. Ao encaminhar, o titular autoriza a {marca} a criar sua conta, entrar em contato e tratar os dados informados para fins da inscrição, conforme a LGPD.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
          Li e aceito os termos e condições.
        </label>
      </div>

      {erro ? <p style={{ color: "#B8860B", fontSize: 13, marginTop: 12 }}>{erro}</p> : null}

      <button onClick={encaminhar} disabled={enviando} style={{ width: "100%", background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "14px 18px", fontSize: 15, fontWeight: 500, cursor: enviando ? "wait" : "pointer", marginTop: 16, opacity: enviando ? 0.7 : 1 }}>
        {enviando ? "Enviando..." : "Confirmar e encaminhar matrícula"}
      </button>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--p-muted)", fontWeight: 500 };
const inp: React.CSSProperties = { border: "1px solid #DCDCE8", borderRadius: 6, padding: "9px 12px", fontSize: 13.5, background: "#fff", color: "var(--p-ink)", fontFamily: "var(--p-body)" };
