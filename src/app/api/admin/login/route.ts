import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarSessaoAdmin, ADMIN_SESSION_COOKIE, compararSeguro } from "@/lib/admin-session";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp, checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Sem estes limites, esta rota permitia adivinhacao online ilimitada contra uma
// credencial estatica de ambiente — a seguranca do painel inteiro se reduzia a
// entropia de uma variavel. Falha FECHADO pelo mesmo motivo do /verify.
const LIMITE_LOGIN_IP = 10;
const JANELA_LOGIN_SEGUNDOS = 600;

// POST { usuario, senha } -> valida contra ADMIN_USER / ADMIN_PASSWORD e cria
// um cookie de sessao de admin (httpOnly, 12h). As credenciais ficam apenas
// nas variaveis de ambiente da Vercel; nunca no codigo.
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const usuario = String(body.usuario || "").trim();
  const senha = String(body.senha || "");

  const usuarioEsperado = process.env.ADMIN_USER;
  const senhaEsperada = process.env.ADMIN_PASSWORD;

  if (!usuarioEsperado || !senhaEsperada) {
    return NextResponse.json(
      { ok: false, erro: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  const ip = obterIp(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  if (supabase) {
    const permitido = await checarELimitar(
      supabase,
      `admin-login:ip:${ip}`,
      LIMITE_LOGIN_IP,
      JANELA_LOGIN_SEGUNDOS,
      Date.now(),
      true
    );
    if (!permitido) {
      await registrarAuditoriaAdmin(supabase, {
        usuario: "desconhecido",
        acao: "admin.login.bloqueado",
        alvo: null,
        detalhe: { metodo: "usuario_senha", motivo: "limite_ip" },
        ip,
      });
      return NextResponse.json(
        { ok: false, erro: "Número máximo de tentativas excedido. Tente novamente mais tarde." },
        { status: 429 }
      );
    }
  }

  const usuarioOk = compararSeguro(usuario, usuarioEsperado);
  const senhaOk = compararSeguro(senha, senhaEsperada);

  if (!usuarioOk || !senhaOk) {
    // Falha de autenticacao passa a ser auditada: antes, so o sucesso gerava
    // linha, entao uma campanha de forca bruta nao deixava nenhum rastro.
    if (supabase) {
      await registrarAuditoriaAdmin(supabase, {
        usuario: "desconhecido",
        acao: "admin.login.falha",
        alvo: null,
        detalhe: { metodo: "usuario_senha" },
        ip,
      });
    }
    return NextResponse.json(
      { ok: false, erro: "Usuario ou senha invalidos." },
      { status: 401 }
    );
  }

  if (supabase) {
    await registrarAuditoriaAdmin(supabase, {
      usuario,
      acao: "admin.login",
      alvo: null,
      detalhe: { metodo: "usuario_senha" },
      ip,
    });
  }

  const token = criarSessaoAdmin(usuario);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
