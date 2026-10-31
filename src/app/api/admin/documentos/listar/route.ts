import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";

export const runtime = "nodejs";

// Lista os documentos de um titular (por id ou CPF) para a tela de admin
// aprovar/rejeitar documentos enviados pelo cliente.
export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

const { searchParams } = new URL(request.url);
  const cpfRaw = searchParams.get("cpf") || "";
  const cpfInformado = cpfRaw.replace(/\D/g, "");
  // A tela escolhe o cliente pelo NOME e manda o id; o CPF segue aceito.
  const titularIdInformado = searchParams.get("titularId") || "";

if (!cpfInformado && !titularIdInformado) {
  return NextResponse.json({ ok: false, error: "Informe o cliente" }, { status: 400 });
}
if (titularIdInformado && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(titularIdInformado)) {
  return NextResponse.json({ ok: false, error: "Titular invalido" }, { status: 400 });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

const consultaTitular = supabase.from("titulares").select("id, cpf");
  const { data: titular, error: titularError } = await (titularIdInformado
    ? consultaTitular.eq("id", titularIdInformado)
    : consultaTitular.eq("cpf", cpfInformado)
  ).single();
  if (titularError || !titular) {
    return NextResponse.json({ ok: false, error: "Titular nao encontrado" }, { status: 404 });
  }
  const cpf = String(titular.cpf || cpfInformado);

// Isolamento por tenant: titular de outro tenant -> 404 (mesma resposta de inexistente).
const barrado = await barrarTitularForaDoEscopo(supabase, titular.id);
if (barrado) return barrado;

const { data: documentos, error } = await supabase.from("documentos").select("*").eq("titular_id", titular.id).order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao buscar documentos" }, { status: 500 });
  }

// Listar os documentos de um titular tambem e leitura de PII: expoe a
// taxonomia completa (passaporte, CPF, visto) daquela pessoa. Auditado pelo
// mesmo motivo do download.
await registrarAuditoriaAdmin(supabase, {
  usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
  acao: "documento.listar",
  alvo: cpf,
  detalhe: { titular_id: titular.id, quantidade: (documentos || []).length },
  ip: obterIp(request),
});

return NextResponse.json({ ok: true, documentos });
}
