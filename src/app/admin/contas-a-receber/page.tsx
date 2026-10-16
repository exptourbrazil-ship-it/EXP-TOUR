import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarFaturas, listarCasosParaFatura, listarEscolas, obterEmissor, totaisPorMoeda } from "@/lib/comissao-fatura-service";
import ContasAReceberClient from "./ContasAReceberClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contas a receber de comissão das escolas (aluno pagou direto à escola). Leitura:
// financeiro.ver; criar/emitir/receber/cancelar exigem financeiro.gerir (revalidado
// em cada rota — a UI só espelha a matriz).
export default async function ContasAReceberPage() {
  const { papel } = await exigirCapacidade("financeiro.ver", "/admin/contas-a-receber");
  const podeGerir = podeAdmin(papel, "financeiro.gerir");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const [faturas, emissor, casos, escolas] = await Promise.all([
    listarFaturas(supabase, tenantId),
    obterEmissor(supabase, tenantId),
    podeGerir ? listarCasosParaFatura(supabase, tenantId) : Promise.resolve([]),
    podeGerir ? listarEscolas(supabase, tenantId) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Contas a receber</h1>
      <p className="mb-4 max-w-3xl text-sm text-neutral-600">
        Comissões das escolas quando o aluno paga o programa direto a elas: crie a fatura, envie à escola por e-mail (com o PDF),
        acompanhe o vencimento e registre o recebimento. A escola vê as faturas no portal dela.
      </p>
      <ContasAReceberClient
        faturas={JSON.parse(JSON.stringify(faturas))}
        totais={totaisPorMoeda(faturas)}
        emissor={emissor}
        casos={casos}
        escolas={escolas}
        podeGerir={podeGerir}
      />
    </div>
  );
}
