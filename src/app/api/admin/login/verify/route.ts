import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificarTokenCodigo, ADMIN_CODIGO_COOKIE } from "@/lib/admin-codigo";
import { criarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSAO_MAX_AGE = 60 * 60 * 12; // 12 horas

// Limites de tentativa. Sem eles o codigo de 6 digitos (900 mil valores) era
// enumeravel: o token fica num cookie que o proprio atacante guarda, entao ele
// pedia UM codigo, o admin recebia UM e-mail, e o atacante repetia /verify a
// vontade — nada no servidor contava as tentativas. Com o teto por token o
// atacante precisaria de ~180 mil tokens, e cada token exige um e-mail ao
// admin e passa pelo limite por IP do /request.
const LIMITE_VERIFY_TOKEN = 5;
const LIMITE_VERIFY_IP = 10;
const JANELA_VERIFY_SEGUNDOS = 600;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Passo 2 do login do admin: confere o código informado contra o token
// assinado guardado no cookie (definido no /request). Se válido, abre a
// sessão de admin (cookie httpOnly de 12h) e remove o cookie do código.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as any));
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";

  if (!/^[0-9]{6}$/.test(codigo)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(ADMIN_CODIGO_COOKIE + "="))
    ?.slice(ADMIN_CODIGO_COOKIE.length + 1);

  const ip = obterIp(request);
  const supabase = getSupabase();

  // Contadores de tentativa. Falham FECHADO: sem o contador nao existe defesa
  // contra forca bruta, e liberar "para nao atrapalhar" e exatamente o que
  // abriria a porta.
  if (supabase) {
    // Por token: amarra as tentativas ao codigo especifico que esta sendo
    // atacado. Hash porque o token e material de autenticacao e nao deve ser
    // gravado em claro na tabela de rate limit.
    const idToken = token
      ? crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex").slice(0, 32)
      : "sem-token";

    const okToken = await checarELimitar(
      supabase,
      `admin-verify:token:${idToken}`,
      LIMITE_VERIFY_TOKEN,
      JANELA_VERIFY_SEGUNDOS,
      Date.now(),
      true
    );
    const okIp = await checarELimitar(
      supabase,
      `admin-verify:ip:${ip}`,
      LIMITE_VERIFY_IP,
      JANELA_VERIFY_SEGUNDOS,
      Date.now(),
      true
    );

    if (!okToken || !okIp) {
      await registrarAuditoriaAdmin(supabase, {
        usuario: "desconhecido",
        acao: "admin.login.bloqueado",
        alvo: null,
        detalhe: { metodo: "codigo_email", motivo: !okToken ? "limite_token" : "limite_ip" },
        ip,
      });
      return NextResponse.json(
        { error: "Número máximo de tentativas excedido. Solicite um novo código." },
        { status: 429 }
      );
    }
  }

  let valido = false;
  try {
    valido = verificarTokenCodigo(token ? decodeURIComponent(token) : null, codigo);
  } catch {
    return NextResponse.json(
      { error: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  if (!valido) {
    // Falha de autenticacao passa a deixar rastro. Antes, uma campanha de forca
    // bruta contra o painel era invisivel ao vivo e na apuracao posterior.
    if (supabase) {
      await registrarAuditoriaAdmin(supabase, {
        usuario: "desconhecido",
        acao: "admin.login.falha",
        alvo: null,
        detalhe: { metodo: "codigo_email" },
        ip,
      });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 401 });
  }

  const usuario = process.env.ADMIN_EMAIL || "rodrigo@exp-tour.com";
  const sessao = criarSessaoAdmin(usuario);

  if (supabase) {
    await registrarAuditoriaAdmin(supabase, {
      usuario,
      acao: "admin.login",
      alvo: null,
      detalhe: { metodo: "codigo_email" },
      ip,
    });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, sessao, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_MAX_AGE,
  });
  res.cookies.set(ADMIN_CODIGO_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
