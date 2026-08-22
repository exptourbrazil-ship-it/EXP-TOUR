import { tenantIdAtual } from "@/lib/catalog-service";
import { createQuote } from "@/lib/quote-service";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  isUuid,
  resolverAdminUserId,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/quotes — cria uma cotacao (rascunho).
// Body: studentId (uuid), ownerUserId? (uuid), locale?, presentmentCurrency?
//
// owner_user_id e uuid no schema. A sessao admin identifica por e-mail, entao o
// dono padrao e resolvido para o id (uuid) do admin em `admin_users` pelo e-mail
// da sessao. O chamador pode sobrepor enviando ownerUserId (uuid valido).
export async function POST(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const studentId = typeof b.studentId === "string" ? b.studentId : "";
  const locale = typeof b.locale === "string" ? b.locale : undefined;
  const presentmentCurrency =
    typeof b.presentmentCurrency === "string" ? b.presentmentCurrency : undefined;

  if (!isUuid(studentId)) return bad("Informe studentId (uuid) valido.");
  if (b.ownerUserId != null && !isUuid(b.ownerUserId)) {
    return bad("ownerUserId deve ser um uuid.");
  }

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);

    // Dono: o uuid enviado, ou o id do admin da sessao (via e-mail).
    const ownerUserId = isUuid(b.ownerUserId)
      ? b.ownerUserId
      : await resolverAdminUserId(supabase, g.usuario);
    if (!ownerUserId) {
      return bad(
        "Nao foi possivel identificar o admin da sessao (cadastre em admin_users) ou envie ownerUserId.",
        "sem_dono",
      );
    }

    const result = await createQuote(
      supabase,
      { tenantId, studentId, ownerUserId, locale, presentmentCurrency },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
