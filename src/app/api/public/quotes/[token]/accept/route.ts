import { guardPortal, portalErro, portalOk } from "@/lib/portal-route";
import { acceptQuote } from "@/lib/quote-checkout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/quotes/[token]/accept — aceite do Termo de Adesao e conversao
// da cotacao em contrato (checkout publico, SO ACEITE, sem pagamento).
// Body: { cpf, email, telefone, nome?, aceite: true }. Deriva valor/parcelas do
// BANCO (nunca do corpo); a funcao SQL converter_cotacao faz a escrita atomica
// e idempotente. O IP/User-Agent viram prova do aceite (tabela aceites).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const g = await guardPortal(request, token);
  if (!g.ok) return g.response;

  const b = (await request.json().catch(() => ({}))) ?? {};
  // Aceite explicito obrigatorio: a UI so envia aceite=true apos exibir o termo.
  if (b.aceite !== true) {
    return portalErro("É necessário aceitar o Termo de Adesão para continuar.", "aceite_necessario", 400);
  }
  if (typeof b.cpf !== "string" || typeof b.email !== "string") {
    return portalErro("Informe CPF e e-mail.", "invalido", 400);
  }

  const res = await acceptQuote(
    g.supabase,
    token,
    {
      cpf: b.cpf,
      email: b.email,
      telefone: typeof b.telefone === "string" ? b.telefone : "",
      nome: typeof b.nome === "string" ? b.nome : null,
    },
    { ip: g.ip, userAgent: request.headers.get("user-agent") },
  );

  if (!res.ok) return portalErro(res.erro, "aceite_falhou", res.status);
  return portalOk({ contratoId: res.contratoId, jaConvertida: res.jaConvertida });
}
