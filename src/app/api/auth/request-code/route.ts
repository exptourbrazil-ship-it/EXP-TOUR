import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarCodigoAcessoEmail } from "@/lib/email";

function limparCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

function gerarCodigo(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// Normaliza o telefone cadastrado (que pode vir do Zoho em formatos variados,
// ex: "(51) 99924-4894") para o formato que a WhatsApp Cloud API espera:
// apenas digitos, com codigo do pais. Assume Brasil (55) quando o numero
// tem 10 ou 11 digitos (DDD + numero) e ainda nao tem o codigo do pais.
function normalizarTelefone(telefone: string): string {
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length === 10 || digitos.length === 11) {
          return `55${digitos}`;
    }
    return digitos;
}

// Recebe um CPF, verifica se existe um titular cadastrado com esse CPF e,
// se existir e tiver email, gera um codigo de acesso de 6 digitos, grava
// na tabela codigos_acesso (valido por 10 minutos) e envia por e-mail (Resend).
// A resposta e sempre generica (nao revela se o CPF existe ou nao), para
// evitar que alguem descubra quais CPFs estao cadastrados.
export async function POST(request: Request) {
    const body = await request.json();
    const cpf = body?.cpf;

  if (typeof cpf !== "string" || limparCpf(cpf).length !== 11) {
        return NextResponse.json({ error: "CPF invalido" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const cpfLimpo = limparCpf(cpf);

  const { data: titular } = await supabase
      .from("titulares")
              .select("id, nome_completo, email")
      .eq("cpf", cpfLimpo)
      .maybeSingle();

      if (!titular || !titular.email) {
        return NextResponse.json({ success: true });
  }

  const codigo = gerarCodigo();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from("codigos_acesso").insert({
        titular_id: titular.id,
        codigo,
        expires_at: expiresAt,
  });

  try {
                await enviarCodigoAcessoEmail(titular.email, titular.nome_completo, codigo);
  } catch (err) {
                console.error("Falha ao enviar codigo por email", err);
  }

  return NextResponse.json({ success: true });
}
