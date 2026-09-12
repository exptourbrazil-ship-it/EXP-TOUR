import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { avaliarTravaRemessa } from "@/lib/trava-remessa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compartilha (ou deixa de compartilhar) UM documento com a escola no Portal do
// Fornecedor. Nada e visivel a escola por padrao; aqui o admin decide caso a
// caso. Autorizacao por capacidade documentos.analisar (mesma da analise inline).
//
// A visibilidade no portal e SEMPRE por contrato (isolamento entre escolas). Por
// isso, ao compartilhar um documento de nivel titular (sem contrato_id), tentamos
// vincula-lo ao contrato do titular quando ele tem exatamente UM; se houver mais
// de um (ou nenhum), recusamos e pedimos que a viagem/contrato seja resolvida
// antes — compartilhar sem contrato deixaria o doc invisivel (ou ambiguo).
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body?.compartilhar !== "boolean") {
    return NextResponse.json({ ok: false, error: "Informe compartilhar (boolean)." }, { status: 400 });
  }
  const compartilhar = body.compartilhar as boolean;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titular_id, contrato_id, tipo_documento, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";

  // Resolve o contrato efetivo do documento (usado tanto para a trava D+7 quanto
  // para o vinculo por contrato). Ao compartilhar um doc de nivel titular (sem
  // contrato_id), vincula ao contrato do titular quando ele tem exatamente UM;
  // com 0 ou >1, recusa (compartilhar sem contrato deixaria o doc invisivel/ambiguo).
  let contratoId: string | null = doc.contrato_id ?? null;
  let contratoVinculado: string | null = null;
  if (compartilhar && !contratoId) {
    const { data: contratos } = await supabase
      .from("contratos")
      .select("id")
      .eq("titular_id", doc.titular_id);
    if ((contratos?.length ?? 0) === 1) {
      contratoId = contratos![0].id;
      contratoVinculado = contratos![0].id;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Documento sem contrato vinculado (o titular tem 0 ou mais de 1 contrato). Vincule o documento a um contrato antes de compartilhar.",
        },
        { status: 422 }
      );
    }
  }

  // Trava D+7 (Cláusula 2.5.2 / CDC art. 49): compartilhar um documento com a
  // escola É "envio ao Fornecedor" — não pode ocorrer enquanto o direito de
  // arrependimento (7 dias do aceite) estiver correndo, salvo processamento
  // imediato autorizado pelo cliente. Fail-closed, MESMA regra da remessa
  // financeira (executarRepasse). Descompartilhar (remover acesso) é sempre livre.
  if (compartilhar && contratoId) {
    const { data: contrato, error: contratoErr } = await supabase
      .from("contratos")
      .select("created_at, data_fim_arrependimento, processamento_imediato")
      .eq("id", contratoId)
      .maybeSingle();
    // Fail-closed: sem conseguir LER o contrato (erro transitório) não dá para
    // avaliar a trava — recusa, em vez de cair no ramo "sem_aceite" (que liberaria).
    // Mantém paridade com executarRepasse, que recusa quando o caso não carrega.
    if (contratoErr || !contrato) {
      console.error(
        "[documentos/compartilhar] falha ao ler contrato para a trava:",
        contratoErr?.message ?? "contrato nao encontrado",
      );
      return NextResponse.json(
        { ok: false, error: "Não foi possível verificar a trava de arrependimento agora. Tente novamente." },
        { status: 503 }
      );
    }
    const trava = avaliarTravaRemessa({
      aceiteISO: contrato.created_at ?? null,
      fimArrependimentoISO: contrato.data_fim_arrependimento ?? null,
      agoraISO: new Date().toISOString(),
      processamentoImediato: !!contrato.processamento_imediato,
    });
    if (!trava.liberado) {
      const ate = trava.liberaEmISO
        ? new Date(trava.liberaEmISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : null;
      return NextResponse.json(
        {
          ok: false,
          error: `Compartilhamento travado: direito de arrependimento em curso${ate ? ` até ${ate}` : ""}. Marque "processamento imediato" (autorização do cliente) para liberar antes.`,
        },
        { status: 409 }
      );
    }
  }

  const patch: Record<string, unknown> = {
    compartilhado_fornecedor: compartilhar,
    compartilhado_em: compartilhar ? new Date().toISOString() : null,
    compartilhado_por: compartilhar ? usuario : null,
  };
  if (contratoVinculado) patch.contrato_id = contratoVinculado;

  const { error } = await supabase.from("documentos").update(patch).eq("id", id);
  if (error) {
    console.error("[documentos/compartilhar] update falhou:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao atualizar o compartilhamento." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: compartilhar ? "documento.compartilhar" : "documento.descompartilhar",
    alvo: id,
    detalhe: {
      titular_id: doc.titular_id,
      tipo_documento: doc.tipo_documento,
      // Registra o vinculo automatico de contrato (muda a que contrato o doc
      // pertence), para a trilha ter o antes/depois.
      ...(contratoVinculado ? { contrato_id_anterior: null, contrato_id_novo: contratoVinculado } : {}),
    },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, compartilhado: compartilhar });
}
