import { tenantIdAtual } from "@/lib/catalog-service";
import { addQuoteNote, hideQuoteNote, NOTA_MAX_CARACTERES } from "@/lib/quote-service";
import { checarELimitar } from "@/lib/rate-limit";
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

// Rate limit por admin: publicar nota dispara e-mail/leitura do estudante; um
// laço acidental encheria o link de avisos.
const LIMITE_NOTAS = 20;
const JANELA_SEGUNDOS = 300;

// POST /api/admin/quotes/[id]/notas — publica uma nota PÓS-EMISSÃO no link do
// estudante, sem reemitir (o link atual continua valendo).
// Body: { body } — TEXTO PURO, nao HTML.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!isUuid(quoteId)) return bad("Id de cotacao invalido.");

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");
  // TEXTO PURO: o HTML e montado no servico, escapando uma unica vez. O teto
  // e o mesmo que a tela conta (caracteres digitados), nao o do HTML gerado —
  // senao uma nota que a tela disse caber seria recusada pelo wrap das tags.
  const body = typeof b.body === "string" ? b.body : "";
  if (!body.trim()) return bad("Escreva a nota antes de publicar.");
  if (body.length > NOTA_MAX_CARACTERES) {
    return bad(`A nota passa de ${NOTA_MAX_CARACTERES} caracteres.`);
  }

  try {
    const supabase = getSupabase();

    const permitido = await checarELimitar(
      supabase,
      `catalog:quote-nota:${g.usuario}`,
      LIMITE_NOTAS,
      JANELA_SEGUNDOS,
    );
    if (!permitido) {
      return bad("Muitas notas em sequencia. Aguarde alguns instantes.", "rate_limited", 429);
    }

    const tenantId = await tenantIdAtual(supabase);
    const adminUserId = await resolverAdminUserId(supabase, g.usuario);
    const result = await addQuoteNote(
      supabase,
      { tenantId, quoteId, body },
      { usuario: g.usuario, ip: g.ip, adminUserId },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}

// DELETE /api/admin/quotes/[id]/notas — retrata uma nota: some do portal, o
// registro permanece. Body: { noteId }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!isUuid(quoteId)) return bad("Id de cotacao invalido.");

  const b = await request.json().catch(() => null);
  const noteId = b && typeof b.noteId === "string" ? b.noteId : "";
  if (!isUuid(noteId)) return bad("Informe noteId.");

  try {
    const supabase = getSupabase();

    const permitido = await checarELimitar(
      supabase,
      `catalog:quote-nota:${g.usuario}`,
      LIMITE_NOTAS,
      JANELA_SEGUNDOS,
    );
    if (!permitido) {
      return bad("Muitas operacoes em sequencia. Aguarde alguns instantes.", "rate_limited", 429);
    }

    const tenantId = await tenantIdAtual(supabase);
    const adminUserId = await resolverAdminUserId(supabase, g.usuario);
    const result = await hideQuoteNote(
      supabase,
      { tenantId, quoteId, noteId },
      { usuario: g.usuario, ip: g.ip, adminUserId },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
