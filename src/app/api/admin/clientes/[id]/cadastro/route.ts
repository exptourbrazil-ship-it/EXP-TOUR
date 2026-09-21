import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import {
  atualizarContatoTitular,
  atualizarCpfTitular,
  CadastroInvalido,
} from "@/lib/cadastro-service";

export const runtime = "nodejs";

// Edita os dados cadastrais do titular [id] (Caso 360). Duas secoes:
//  - "contato" (nome/telefone/email): capacidade casos.gerir.
//  - "cpf" (muda a identidade de login): capacidade override + justificativa.
// A mutacao (validacao/transacao/auditoria) vive em src/lib/cadastro-service.ts.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const secao = String(body?.secao || "");

  // A capacidade exigida depende da secao — o CPF e sensivel (so Gestor).
  const capacidade = secao === "cpf" ? "override" : "casos.gerir";
  if (!(await checarCapacidadeAdmin(capacidade))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  // Isolamento por tenant: barra se o titular da URL nao esta no escopo do admin.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarTitularForaDoEscopo(supabase, titularId);
  if (barrado) return barrado;

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  const ip = obterIp(request);

  try {
    if (secao === "contato") {
      await atualizarContatoTitular({
        titularId,
        nome_completo: String(body?.nome_completo ?? ""),
        telefone: body?.telefone,
        email: body?.email,
        autor,
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    if (secao === "cpf") {
      await atualizarCpfTitular({
        titularId,
        cpf: String(body?.cpf ?? ""),
        justificativa: String(body?.justificativa ?? ""),
        autor,
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Secao invalida" }, { status: 400 });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      const status = err.codigo === "duplicado" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.message }, { status });
    }
    console.error("[cadastro] falha ao atualizar dados cadastrais do titular");
    return NextResponse.json(
      { ok: false, error: "Falha ao atualizar os dados cadastrais" },
      { status: 500 }
    );
  }
}
