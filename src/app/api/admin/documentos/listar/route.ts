import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lista os documentos de um titular (por CPF) para a tela de admin
// aprovar/rejeitar documentos enviados pelo cliente.
export async function GET(request: Request) {
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

const { searchParams } = new URL(request.url);
  const cpfRaw = searchParams.get("cpf") || "";
  const cpf = cpfRaw.replace(/\D/g, "");

if (!cpf) {
  return NextResponse.json({ ok: false, error: "Informe cpf" }, { status: 400 });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: titular, error: titularError } = await supabase.from("titulares").select("id").eq("cpf", cpf).single();
  if (titularError || !titular) {
    return NextResponse.json({ ok: false, error: "Titular nao encontrado para este CPF" }, { status: 404 });
  }

const { data: documentos, error } = await supabase.from("documentos").select("*").eq("titular_id", titular.id).order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao buscar documentos" }, { status: 500 });
  }

return NextResponse.json({ ok: true, documentos });
}
