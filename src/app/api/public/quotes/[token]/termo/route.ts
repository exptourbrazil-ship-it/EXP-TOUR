import { guardPortal, portalErro, portalOk } from "@/lib/portal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/quotes/[token]/termo — Termo de Adesao vigente, para o portal
// exibir o texto ANTES do aceite (CDC art. 46). Guardado pelo token (rate-limit
// + formato). O termo e global (tabela termos, sem tenant); a prova do aceite e
// gravada pela rota /accept com IP/UA + hash do termo vigente NAQUELE momento.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const g = await guardPortal(request, token);
  if (!g.ok) return g.response;

  const { data: termo } = await g.supabase
    .from("termos")
    .select("versao, conteudo, storage_path")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!termo) return portalErro("Termo de adesão indisponível no momento.", "sem_termo", 503);
  return portalOk({
    versao: termo.versao as string,
    conteudo: (termo.conteudo as string) ?? null,
    storagePath: (termo.storage_path as string) ?? null,
  });
}
