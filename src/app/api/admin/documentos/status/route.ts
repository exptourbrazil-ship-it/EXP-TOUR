import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STATUS_VALIDOS = ["pendente", "aprovado", "rejeitado"];

// Permite que o admin (autenticado com ADMIN_CAMBIO_SECRET) aprove ou
// rejeite um documento enviado pelo titular.
export async function PATCH(request: Request) {
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
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

return NextResponse.json({ ok: true });
}
