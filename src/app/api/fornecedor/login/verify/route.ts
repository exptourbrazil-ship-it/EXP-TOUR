import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { conferirTokenCodigo, FORNECEDOR_CODIGO_COOKIE } from "@/lib/fornecedor-codigo";
import { criarSessaoFornecedor, FORNECEDOR_SESSION_COOKIE } from "@/lib/fornecedor-session";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSAO_MAX_AGE = 60 * 60 * 12; // 12 horas

// Limites de tentativa (mesmo racional do admin): o codigo de 6 digitos so nao e
// enumeravel porque o /verify e limitado por token e por IP, falhando FECHADO.
const LIMITE_VERIFY_TOKEN = 5;
const LIMITE_VERIFY_IP = 10;
const JANELA_VERIFY_SEGUNDOS = 600;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Passo 2 do login do fornecedor: confere o codigo contra o token assinado do
// cookie (definido no /request). Se valido, confirma o usuario ativo, abre a
// sessao (cookie httpOnly de 12h) e remove o cookie do codigo.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";

  if (!/^[0-9]{6}$/.test(codigo)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(FORNECEDOR_CODIGO_COOKIE + "="))
    ?.slice(FORNECEDOR_CODIGO_COOKIE.length + 1);

  const ip = obterIp(request);
  const supabase = getSupabase();

  // Falha FECHADO: sem Supabase nao ha como limitar tentativas nem confirmar o
  // usuario ativo.
  if (!supabase) {
    console.error("Supabase nao configurado: /fornecedor/verify recusado.");
    return NextResponse.json(
      { error: "Login de fornecedor nao configurado no servidor." },
      { status: 503 }
    );
  }

  // Contadores de tentativa. Falham FECHADO (true): sem o contador nao ha defesa
  // contra forca bruta do codigo.
  const idToken = token
    ? crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex").slice(0, 32)
    : "sem-token";
  const okToken = await checarELimitar(
    supabase,
    `fornecedor-verify:token:${idToken}`,
    LIMITE_VERIFY_TOKEN,
    JANELA_VERIFY_SEGUNDOS,
    Date.now(),
    true
  );
  const okIp = await checarELimitar(
    supabase,
    `fornecedor-verify:ip:${ip}`,
    LIMITE_VERIFY_IP,
    JANELA_VERIFY_SEGUNDOS,
    Date.now(),
    true
  );
  if (!okToken || !okIp) {
    return NextResponse.json(
      { error: "Número máximo de tentativas excedido. Solicite um novo código." },
      { status: 429 }
    );
  }

  let resultado: { ok: boolean; email: string | null } = { ok: false, email: null };
  try {
    resultado = conferirTokenCodigo(token ? decodeURIComponent(token) : null, codigo);
  } catch {
    return NextResponse.json(
      { error: "Login de fornecedor nao configurado no servidor." },
      { status: 500 }
    );
  }

  if (!resultado.ok || !resultado.email) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 401 });
  }

  // Confirma que o usuario ainda esta ativo (pode ter sido desativado entre o
  // /request e o /verify) e obtem os dados da sessao. Falha fechada.
  const { data: usuario } = await supabase
    .from("supplier_user")
    .select("id, supplier_id, email, role, language, active, archived_at")
    .eq("email", resultado.email)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (!usuario) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  // Registra o ultimo login (best-effort: nao derruba o login se falhar).
  await supabase
    .from("supplier_user")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", usuario.id);

  const sessao = criarSessaoFornecedor({
    supplierUserId: usuario.id,
    supplierId: usuario.supplier_id,
    email: usuario.email,
    role: usuario.role,
    language: usuario.language,
  });

  const res = NextResponse.json({ success: true });
  res.cookies.set(FORNECEDOR_SESSION_COOKIE, sessao, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_MAX_AGE,
  });
  res.cookies.set(FORNECEDOR_CODIGO_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
