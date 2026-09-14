import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { escopoTenantAdmin, escopoPermiteContrato, tenantDoContrato } from "@/lib/admin-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// Status que a equipe pode aplicar a uma solicitação de cancelamento. NÃO
// reabre para "solicitado" (é o estado que só o cliente cria). Mudar o status
// aqui é acompanhamento — não cancela o contrato nem move dinheiro (isso é o
// fluxo de acerto). "concluido" apenas marca que a equipe conduziu o acerto.
const STATUS_PERMITIDOS = new Set(["em_analise", "concluido", "cancelado"]);

// POST: atualiza o status de uma solicitação de cancelamento do cliente.
// Body: { solicitacaoId, status }. Gateado por cancelamento.gerir (RBAC) +
// escopo de tenant. A solicitação precisa pertencer ao contrato de [id].
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "cancelamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = supa();

  // Isolamento por tenant: contrato de outro tenant (ou inexistente) -> 404.
  const escopo = await escopoTenantAdmin(supabase);
  if (!escopo.global) {
    const { existe, tenantId } = await tenantDoContrato(supabase, id);
    if (!existe || !escopoPermiteContrato(escopo, tenantId)) {
      return NextResponse.json({ ok: false, error: "Contrato não encontrado" }, { status: 404 });
    }
  }

  const b = await request.json().catch(() => null);
  const solicitacaoId = b?.solicitacaoId ? String(b.solicitacaoId) : "";
  const status = b?.status ? String(b.status) : "";
  if (!solicitacaoId) return NextResponse.json({ ok: false, error: "Informe a solicitação." }, { status: 400 });
  if (!STATUS_PERMITIDOS.has(status)) {
    return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
  }

  // Posse cruzada: a solicitação tem de ser DESTE contrato (impede mover a
  // solicitação de outro caso passando um id avulso).
  const { data: solic } = await supabase
    .from("cancelamento_solicitacao")
    .select("id, contrato_id, status")
    .eq("id", solicitacaoId)
    .maybeSingle();
  if (!solic || solic.contrato_id !== id) {
    return NextResponse.json({ ok: false, error: "Solicitação não encontrada" }, { status: 404 });
  }

  // Guarda de máquina de estados NO SERVIDOR (não confia no ocultamento de
  // botões da UI): estado FINAL não se mexe mais. Isto impede "ressuscitar" um
  // pedido já concluído/descartado por chamada direta à API.
  const statusAtual = String(solic.status || "");
  if (statusAtual === "concluido" || statusAtual === "cancelado") {
    return NextResponse.json(
      { ok: false, error: "Esta solicitação já foi finalizada e não pode mudar de status." },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("cancelamento_solicitacao")
    .update({ status })
    .eq("id", solicitacaoId);
  if (error) {
    return NextResponse.json({ ok: false, error: "Não foi possível atualizar agora." }, { status: 500 });
  }

  // Trilha de auditoria (quem/quando + antes/depois). Best-effort: a mudança de
  // status já está gravada; uma falha aqui não a derruba.
  try {
    const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
    await registrarAuditoriaAdmin(supabase, {
      usuario,
      acao: "cancelamento_solicitacao.status",
      alvo: solicitacaoId,
      detalhe: { contratoId: id, de: statusAtual, para: status },
      ip: obterIp(request),
    });
  } catch {
    console.error("[cancelamento-solicitacao] falha ao registrar auditoria (status já atualizado)");
  }

  return NextResponse.json({ ok: true, status });
}
