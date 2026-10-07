import type { NextResponse } from "next/server";
import { bad, fail } from "@/lib/catalog-route";
import { RestaurarErro } from "@/lib/arquivados-service";

// Mapeia o erro de domínio da restauração para HTTP + mensagem em português.
export function respostaErroRestaurar(err: unknown): NextResponse {
  if (err instanceof RestaurarErro) {
    if (err.codigo === "nao_encontrado") return bad("Registro não encontrado.", "nao_encontrado", 404);
    if (err.codigo === "recusado") return bad(err.mensagem ?? "Restauração recusada.", "recusado", 409);
    console.error("[arquivados] falha ao persistir");
    return bad("Erro interno ao restaurar.", "erro_interno", 500);
  }
  return fail(err);
}
