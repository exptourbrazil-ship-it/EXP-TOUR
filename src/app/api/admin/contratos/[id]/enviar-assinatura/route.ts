import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { montarSignatarios, ehMenorDeIdade } from "@/lib/sign-events";
import { criarEnvelopeDeTemplate } from "@/lib/zoho-sign";
import {
  SIGN_TEMPLATE_ID,
  SIGN_ACTION_CONTRATANTE,
  SIGN_ACTION_ESTUDANTE,
  signTemplateConfigurado,
  montarCamposTemplate,
} from "@/lib/sign-template";

export const runtime = "nodejs";

// Envia um contrato para assinatura no Zoho Sign a partir do template
// configurado. Monta os signatarios (pagante sempre; estudante so se maior de
// idade e com e-mail), cria o envelope e registra em contratos_assinatura.
// Autenticacao: sessao de admin (ou Bearer de compatibilidade).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  if (!signTemplateConfigurado()) {
    return NextResponse.json(
      { ok: false, erro: "Template do Zoho Sign nao configurado (ZOHO_SIGN_TEMPLATE_ID/ZOHO_SIGN_ACTION_CONTRATANTE)." },
      { status: 400 }
    );
  }

  const { id: contratoId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, nome, valor_total, moeda, pais_destino, estudante_nome, estudante_email, estudante_data_nascimento, titular_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (erroContrato || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato nao encontrado." }, { status: 404 });
  }

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo, email, cpf")
    .eq("id", contrato.titular_id)
    .maybeSingle();

  const menor = ehMenorDeIdade(contrato.estudante_data_nascimento, hojeBrasilISO());
  const signatarios = montarSignatarios({
    pagante: { nome: titular?.nome_completo ?? null, email: titular?.email ?? null },
    estudante: { nome: contrato.estudante_nome, email: contrato.estudante_email },
    estudanteEhMenor: menor,
  });

  if (signatarios.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Sem signatario com e-mail (o titular precisa de e-mail cadastrado)." },
      { status: 400 }
    );
  }

  // Liga cada papel ao action_id do template. Se o estudante entrou como
  // signatario mas o action_id dele nao esta configurado, aborta com aviso.
  const actions = [] as Array<{ action_id: string; recipient_name: string; recipient_email: string }>;
  for (const s of signatarios) {
    const actionId = s.papel === "pagante" ? SIGN_ACTION_CONTRATANTE : SIGN_ACTION_ESTUDANTE;
    if (!actionId) {
      return NextResponse.json(
        { ok: false, erro: `action_id do papel '${s.papel}' nao configurado no ambiente.` },
        { status: 400 }
      );
    }
    actions.push({ action_id: actionId, recipient_name: s.nome, recipient_email: s.email });
  }

  const campos = montarCamposTemplate({
    titularNome: titular?.nome_completo ?? null,
    titularCpf: titular?.cpf ?? null,
    titularEmail: titular?.email ?? null,
    programaNome: contrato.nome,
    valorTotal: contrato.valor_total,
    moeda: contrato.moeda,
    destino: contrato.pais_destino,
    estudanteNome: contrato.estudante_nome,
  });

  let requestId: string;
  try {
    const r = await criarEnvelopeDeTemplate({
      templateId: SIGN_TEMPLATE_ID,
      fieldTextData: campos,
      actions,
      quickSend: true,
    });
    requestId = r.requestId;
  } catch (err: any) {
    return NextResponse.json({ ok: false, erro: err?.message || "Falha ao criar o envelope." }, { status: 502 });
  }

  const agora = new Date().toISOString();
  const { error: insErr } = await supabase.from("contratos_assinatura").insert({
    contrato_id: contratoId,
    envelope_id_zoho: requestId,
    status: "enviado",
    signatarios,
    enviado_em: agora,
  });
  if (insErr) {
    // O envelope foi criado no Zoho, mas falhou o registro local. Reporta para
    // reconciliacao manual (o webhook ainda liga o PDF pelo envelope_id).
    return NextResponse.json(
      { ok: false, erro: "Envelope criado no Zoho, mas falhou ao registrar localmente: " + insErr.message, requestId },
      { status: 500 }
    );
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "contrato.enviar_assinatura",
    alvo: contratoId,
    detalhe: { requestId, signatarios: signatarios.length },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, requestId });
}
