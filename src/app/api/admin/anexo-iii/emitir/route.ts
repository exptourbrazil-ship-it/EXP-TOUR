import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { montarAnexoIIISnapshot, serializarAnexoIIISnapshot } from "@/lib/anexo-iii-snapshot";
import { escopoTenantAdmin, escopoPermiteContrato, tenantDoContrato } from "@/lib/admin-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EMITE (congela) o Anexo III de um contrato: monta o snapshot imutável dos itens
// atuais + hash de integridade (Cláusula 18.2) e trava edições posteriores. O que
// o cliente vê passa a ser o EMITIDO. Idempotente: reemitir um já emitido é 409.
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const b = await request.json().catch(() => null);
  const contratoId = b?.contratoId ? String(b.contratoId) : "";
  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "Informe o contrato." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const { data: contrato, error: errC } = await supabase
    .from("contratos")
    .select("id, anexo_iii_snapshot")
    .eq("id", contratoId)
    .maybeSingle();
  if (errC || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato não encontrado." }, { status: 404 });
  }

  // Isolamento por tenant: emitir o Anexo III de contrato de outro tenant -> 404
  // (mesma resposta de inexistente; nao vaza existencia). Global passa direto.
  const escopo = await escopoTenantAdmin(supabase);
  if (!escopo.global) {
    const { tenantId } = await tenantDoContrato(supabase, contratoId);
    if (!escopoPermiteContrato(escopo, tenantId)) {
      return NextResponse.json({ ok: false, erro: "Contrato não encontrado." }, { status: 404 });
    }
  }

  if (contrato.anexo_iii_snapshot != null) {
    return NextResponse.json({ ok: false, erro: "Anexo III já emitido — é imutável." }, { status: 409 });
  }

  const { data: itens, error: errI } = await supabase
    .from("anexo_iii_itens")
    .select("fornecedor, natureza, valor, moeda, prazo, evento, documento_viabiliza, consequencia_atraso, politica_cancelamento, fonte, ordem")
    .eq("contrato_id", contratoId)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (errI) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler os itens do Anexo III." }, { status: 500 });
  }
  if (!itens || itens.length === 0) {
    return NextResponse.json({ ok: false, erro: "Anexo III sem itens — nada a emitir." }, { status: 422 });
  }

  const emitidoEm = new Date().toISOString();
  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  const snapshot = montarAnexoIIISnapshot(itens, { emitidoEm });
  const hash = createHash("sha256").update(serializarAnexoIIISnapshot(snapshot)).digest("hex");

  // Grava só quando ainda não emitido (guarda contra corrida): se outra requisição
  // emitiu no meio, esta não sobrescreve.
  const { data: upd, error: errU } = await supabase
    .from("contratos")
    .update({
      anexo_iii_snapshot: snapshot,
      hash_anexo_iii: hash,
      anexo_iii_emitido_em: emitidoEm,
      anexo_iii_emitido_por: usuario,
    })
    .eq("id", contratoId)
    .is("anexo_iii_snapshot", null)
    .select("id");
  if (errU) {
    return NextResponse.json({ ok: false, erro: "Falha ao emitir o Anexo III." }, { status: 500 });
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json({ ok: false, erro: "Anexo III já emitido — é imutável." }, { status: 409 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "anexo_iii.emitir",
    alvo: contratoId,
    detalhe: { itens: itens.length, hash },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, hash, emitidoEm, itens: itens.length });
}
