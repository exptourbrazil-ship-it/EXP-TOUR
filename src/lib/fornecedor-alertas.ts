// Mapeamento PURO pendencia -> alerta por e-mail (matriz 1-4 da doc 06).
// Sem rede/DB: decide chave de dedupe, destinatarios e conteudo (bilingue).
// Testado em fornecedor-alertas.test.ts. O cron (impuro) so orquestra o envio.
import type { Pendencia } from "./fornecedor-pendencias";

export type UsuarioFornecedorAlerta = {
  id: string;
  email: string | null;
  name: string | null;
  role: string; // supplier_admin | admissions | finance | marketing
  language: string | null; // en | pt
  active: boolean;
};

export type DestinatarioAlerta = { email: string; name: string; language: string };

export type ConteudoAlerta = {
  subject: string;
  titulo: string;
  contexto: string;
  botaoLabel: string;
};

export type AlertaItem = {
  pendencia: Pendencia;
  chave: string; // idempotency_key no ledger `events`
  caminho: string; // caminho relativo no portal (o cron prefixa com APP_URL)
  destinatarios: DestinatarioAlerta[];
};

// Janela do LOA derivada da severidade: 'd7' (urgente, >=D+7) ou 'd3' (atencao,
// >=D+3). Enquanto 'info' (< D+3) nao dispara e-mail — so aparece no Painel.
export function janelaLoa(p: Pendencia): "d3" | "d7" | null {
  if (p.tipo !== "loa_pendente") return null;
  if (p.severidade === "urgente") return "d7";
  if (p.severidade === "atencao") return "d3";
  return null;
}

// Chave de dedupe (unica no ledger `events`). null = ainda nao deve disparar.
export function chaveAlerta(p: Pendencia): string | null {
  switch (p.tipo) {
    case "loa_pendente": {
      const j = janelaLoa(p);
      return j ? `supplier-alert:loa:${p.contratoId}:${j}` : null;
    }
    case "documento_devolvido":
      return p.refId ? `supplier-alert:devolvido:${p.refId}` : null;
    case "docs_viagem":
      return `supplier-alert:viagem:${p.contratoId}`;
    case "nova_matricula":
      return `supplier-alert:matricula:${p.contratoId}`;
    default:
      return null;
  }
}

// Destinatarios do alerta. Documento devolvido vai para QUEM enviou (se ativo);
// os demais (e o fallback) vao para admissions + admin do fornecedor. Sempre
// filtra usuarios ativos e com e-mail; deduplica por e-mail.
export function destinatariosDoAlerta(
  p: Pendencia,
  usuarios: UsuarioFornecedorAlerta[]
): DestinatarioAlerta[] {
  const ativos = usuarios.filter((u) => u.active && !!u.email);
  const dest = (u: UsuarioFornecedorAlerta): DestinatarioAlerta => ({
    email: (u.email as string).toLowerCase(),
    name: u.name || (u.email as string),
    language: u.language === "pt" ? "pt" : "en",
  });

  let alvos: UsuarioFornecedorAlerta[] = [];
  if (p.tipo === "documento_devolvido" && p.destinatarioSupplierUserId) {
    const uploader = ativos.find((u) => u.id === p.destinatarioSupplierUserId);
    if (uploader) alvos = [uploader];
  }
  if (alvos.length === 0) {
    alvos = ativos.filter((u) => u.role === "admissions" || u.role === "supplier_admin");
  }

  const vistos = new Set<string>();
  const out: DestinatarioAlerta[] = [];
  for (const u of alvos) {
    const d = dest(u);
    if (vistos.has(d.email)) continue;
    vistos.add(d.email);
    out.push(d);
  }
  return out;
}

// Conteudo bilingue (EN padrao) por tipo de alerta.
export function conteudoAlerta(p: Pendencia, idioma: string): ConteudoAlerta {
  const en = idioma !== "pt";
  const aluno = p.estudanteNome || (en ? "a student" : "um estudante");
  switch (p.tipo) {
    case "nova_matricula":
      return {
        subject: en ? "New enrolment to review" : "Nova matrícula para revisar",
        titulo: en ? "New enrolment" : "Nova matrícula",
        contexto: en
          ? `A new student (${aluno}) has been assigned to your institution. Review the details and documents.`
          : `Um novo estudante (${aluno}) foi vinculado à sua instituição. Revise os dados e documentos.`,
        botaoLabel: en ? "See student and documents" : "Ver estudante e documentos",
      };
    case "loa_pendente":
      return {
        subject: en ? "Letter of Acceptance pending" : "Carta de Aceite (LOA) pendente",
        titulo: en ? "LOA pending" : "LOA pendente",
        contexto: en
          ? `We're still waiting for the Letter of Acceptance for ${aluno}. Please upload it in the portal.`
          : `Ainda aguardamos a Carta de Aceite (LOA) de ${aluno}. Por favor, envie pelo portal.`,
        botaoLabel: en ? "Upload the Letter of Acceptance" : "Enviar a Letter of Acceptance",
      };
    case "documento_devolvido":
      return {
        subject: en ? "Document returned — please correct" : "Documento devolvido — corrigir",
        titulo: en ? "Document returned" : "Documento devolvido",
        contexto: en
          ? `A document you uploaded for ${aluno} was returned in the review. Please correct and resend it.`
          : `Um documento que você enviou para ${aluno} foi devolvido na conferência. Corrija e reenvie.`,
        botaoLabel: en ? "Correct and resend" : "Corrigir e reenviar",
      };
    case "docs_viagem":
      return {
        subject: en ? "Travel documents available" : "Documentos de viagem disponíveis",
        titulo: en ? "Travel documents available" : "Documentos de viagem",
        contexto: en
          ? `Travel documents for ${aluno} are available in the portal.`
          : `Os documentos de viagem de ${aluno} estão disponíveis no portal.`,
        botaoLabel: en ? "Download travel documents" : "Baixar documentos de viagem",
      };
    default:
      return { subject: "EXP Tour", titulo: "", contexto: "", botaoLabel: "" };
  }
}

// Monta os itens de alerta a enviar: filtra as pendencias que ja devem disparar
// (chave != null) e que tenham ao menos um destinatario. O caminho leva sempre
// ao estudante (contrato).
export function montarAlertas(
  pendencias: Pendencia[],
  usuarios: UsuarioFornecedorAlerta[]
): AlertaItem[] {
  const itens: AlertaItem[] = [];
  for (const p of pendencias) {
    const chave = chaveAlerta(p);
    if (!chave) continue;
    const destinatarios = destinatariosDoAlerta(p, usuarios);
    if (destinatarios.length === 0) continue;
    itens.push({ pendencia: p, chave, caminho: `/fornecedor/estudantes/${p.contratoId}`, destinatarios });
  }
  return itens;
}
