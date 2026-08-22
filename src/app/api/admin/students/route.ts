import { tenantIdAtual } from "@/lib/catalog-service";
import { createStudent } from "@/lib/quote-service";
import { getSupabase, guardCatalog, bad, fail, okData, isIsoDate } from "@/lib/catalog-route";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto de criacao de estudante por ator: evita criacao em massa (admin
// comprometido ou loop de UI). Janela curta, generosa para uso legitimo.
const LIMITE_CRIACAO = 30;
const JANELA_SEGUNDOS = 5 * 60;

// POST /api/admin/students — quick-create de estudante (minimo para cotar).
// Body: firstName, lastName, email?, nationalityCode?, birthDate?
export async function POST(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const firstName = typeof b.firstName === "string" ? b.firstName.trim() : "";
  const lastName = typeof b.lastName === "string" ? b.lastName.trim() : "";
  const email = typeof b.email === "string" ? b.email : undefined;
  const nationalityCode =
    typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;
  const birthDate = typeof b.birthDate === "string" ? b.birthDate : undefined;

  if (!firstName) return bad("Informe firstName.");
  if (!lastName) return bad("Informe lastName.");
  if (birthDate && !isIsoDate(birthDate)) {
    return bad("birthDate invalido (AAAA-MM-DD).");
  }

  try {
    const supabase = getSupabase();

    const permitido = await checarELimitar(
      supabase,
      `catalog:student:${g.usuario}`,
      LIMITE_CRIACAO,
      JANELA_SEGUNDOS,
    );
    if (!permitido) {
      return bad("Muitas criacoes em sequencia. Tente novamente em instantes.", "rate_limited", 429);
    }

    const tenantId = await tenantIdAtual(supabase);
    const result = await createStudent(
      supabase,
      { tenantId, firstName, lastName, email, nationalityCode, birthDate },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
