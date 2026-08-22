import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const STATUS_VALIDOS = ["pendente", "aprovado", "rejeitado"];

// Permite que o admin (autenticado com ADMIN_CAMBIO_SECRET) aprove ou
// rejeite um documento enviado pelo titular.
export async function PATCH(request: Request) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

const body = await request.json();
  const id = String(body.id || "");
  const status = String(body.status || "");

if (!id || !STATUS_VALIDOS.includes(status)) {
  return NextResponse.json({ ok: false, error: "Informe id e status valido" }, { status: 400 });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

const { error } = await supabase.from("documentos").update({ status }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao atualizar status" }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "documento.status.definir",
    alvo: id,
    detalhe: { status },
    ip: obterIp(request),
  });

return NextResponse.json({ ok: true });
}
