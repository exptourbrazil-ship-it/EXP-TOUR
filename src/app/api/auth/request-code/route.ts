import { NextResponse } from "next/server";

// TODO: integrar com provedor de WhatsApp (ex: Meta Cloud API ou Twilio)
// e com a tabela `titulares` no Supabase (via service role, em edge function),
                                           // para validar o CPF e enviar o codigo de acesso real.
                                           export async function POST(request: Request) {
                                             const { cpf } = await request.json();

                                             if (!cpf || typeof cpf !== "string") {
                                               return NextResponse.json({ error: "CPF invalido" }, { status: 400 });
                                               }

                                             // Stub: por enquanto apenas simula o envio do codigo.
                                             return NextResponse.json({ ok: true });
                                             }
