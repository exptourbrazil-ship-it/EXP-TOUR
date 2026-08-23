import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { periodoValido, destinoValido } from "@/lib/forca-maior";
import { contarAfetados, aplicarForcaMaior } from "@/lib/forca-maior-service";

export const runtime = "nodejs";
export const maxDuration = 60; // o lote (abrir E8 + e-mail por contrato) pode demorar

// Forca maior coletiva (E8, doc 01 §4). SO-GESTOR: capability config.gerir
// (parametro/acao de instancia). Dois modos:
//  - confirmar != true -> PREVIEW: retorna a contagem de afetados (nao escreve).
//  - confirmar === true -> APLICA em lote (exige motivo/justificativa).
export async function POST(request: Request) {
  // SO-GESTOR de verdade: sessao + capacidade, SEM o fallback Bearer
  // ADMIN_CAMBIO_SECRET. Esta e a acao de maior blast radius (lote + e-mail em
  // massa); o segredo de compat (cambio/cron) nao pode dispara-la, e o autor
  // precisa ser um gestor identificado (nao "bearer-secret") para a trilha.
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const destino = typeof body?.destino === "string" ? body.destino.trim() : "";
  const inicioDe = typeof body?.inicioDe === "string" && body.inicioDe ? body.inicioDe : null;
  const inicioAte = typeof body?.inicioAte === "string" && body.inicioAte ? body.inicioAte : null;
  const confirmar = body?.confirmar === true;
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";

  if (!destinoValido(destino)) {
    return NextResponse.json({ ok: false, error: "Informe um destino valido" }, { status: 400 });
  }
  if (!periodoValido(inicioDe, inicioAte)) {
    return NextResponse.json({ ok: false, error: "Periodo invalido" }, { status: 400 });
  }

  const filtro = { destino, inicioDe, inicioAte };

  // PREVIEW (read-only): a tela mostra o blast radius antes de aplicar.
  if (!confirmar) {
    try {
      const afetados = await contarAfetados(filtro);
      return NextResponse.json({ ok: true, preview: true, afetados });
    } catch {
      return NextResponse.json({ ok: false, error: "Falha ao pre-visualizar o coorte" }, { status: 500 });
    }
  }

  // APLICAR: acao de alto impacto -> exige justificativa registrada.
  if (!motivo) {
    return NextResponse.json({ ok: false, error: "Informe a justificativa (motivo)" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const resultado = await aplicarForcaMaior({
      destino,
      inicioDe,
      inicioAte,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[forca-maior] falha ao aplicar", err instanceof Error ? err.message : "");
    return NextResponse.json({ ok: false, error: "Falha ao aplicar a forca maior" }, { status: 500 });
  }
}
