import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import { titularPodeCliente } from "@/lib/perfil-service";
import {
  carregarConsequenciasCancelamento,
  solicitarCancelamento,
} from "@/lib/cancelamento-self-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancelamento deliberado self-service do CLIENTE (spec 1 §3). Escopo por POSSE:
// só age no contrato do titular logado. NÃO cancela nem move dinheiro — a rota
// mostra consequências (GET) e registra a solicitação + abre o E4 (POST).

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

async function titularAtual(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verificarSessao(token)?.titularId ?? null;
}

// GET ?contratoId= -> consequências (valor retido, reembolso estimado, alternativas).
export async function GET(request: Request) {
  const titularId = await titularAtual();
  if (!titularId) return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });

  const contratoId = new URL(request.url).searchParams.get("contratoId");
  if (!contratoId) return NextResponse.json({ ok: false, error: "Informe o contrato." }, { status: 400 });

  // Bloqueio por PERFIL (5.4.4 + LGPD): as consequências mostram valores retidos
  // e reembolso — só perfis com pagamento.gerir (o contratante) podem ver/cancelar.
  const clientGet = supa();
  if (!(await titularPodeCliente(clientGet, titularId, "pagamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Seu perfil não permite cancelar o programa." }, { status: 403 });
  }

  const dados = await carregarConsequenciasCancelamento(clientGet, titularId, contratoId);
  if (!dados) return NextResponse.json({ ok: false, error: "Contrato não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, dados });
}

// POST -> registra a solicitação. Body: { contratoId, motivo, motivoDetalhe?, valorCiente }.
export async function POST(request: Request) {
  const titularId = await titularAtual();
  if (!titularId) return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });

  const b = await request.json().catch(() => null);
  const contratoId = b?.contratoId ? String(b.contratoId) : "";
  if (!contratoId) return NextResponse.json({ ok: false, error: "Informe o contrato." }, { status: 400 });

  // Rate limit por titular (defesa contra spam de solicitações + e-mails
  // internos). O serviço deduplica solicitações em aberto, mas o limite corta
  // o abuso antes de tocar o banco/e-mail.
  const client = supa();

  // Bloqueio por PERFIL (5.4.4 + LGPD): cancelar é decisão financeira do
  // contratante. Participante/terceiro pagador -> 403.
  if (!(await titularPodeCliente(client, titularId, "pagamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Seu perfil não permite cancelar o programa." }, { status: 403 });
  }

  const permitido = await checarELimitar(client, `cancelamento:${titularId}`, 5, 3600);
  if (!permitido) {
    return NextResponse.json(
      { ok: false, error: "Muitas solicitações. Aguarde alguns minutos e tente novamente." },
      { status: 429 },
    );
  }

  const res = await solicitarCancelamento(client, titularId, contratoId, {
    motivo: b?.motivo ? String(b.motivo) : "",
    motivoDetalhe: typeof b?.motivoDetalhe === "string" ? b.motivoDetalhe : null,
    valorCienteBRL: b?.valorCiente,
    ip: obterIp(request),
  });
  if (!res.ok) {
    const status = res.codigo === "posse" ? 404 : res.codigo === "falha" ? 500 : 400;
    return NextResponse.json({ ok: false, error: res.erro, codigo: res.codigo }, { status });
  }
  return NextResponse.json({ ok: true, solicitacaoId: res.solicitacaoId });
}
