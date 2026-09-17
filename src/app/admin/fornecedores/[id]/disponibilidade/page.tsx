import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarFornecedorDoTenant } from "@/lib/fornecedor-hub-service";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos } from "@/lib/catalog-disponibilidade";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";
import AcomodacaoClient from "@/components/AcomodacaoClient";
import { notFound } from "next/navigation";
import PropostasDisponibilidadeBloco from "@/app/admin/disponibilidade/PropostasDisponibilidadeBloco";
import { listarPropostasDisponibilidade } from "@/lib/disponibilidade-proposta-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Disponibilidade do hub: mesmas telas de datas/vagas do portal, já fixadas
// neste fornecedor (sem seletor). O endpoint admin revalida cada mutação.
export default async function FornecedorDisponibilidadePage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const fornecedor = await carregarFornecedorDoTenant(supabase, tenantId, id);
  if (!fornecedor) notFound();

  const [programas, acomodacoes, propostas] = await Promise.all([
    listarProgramasComIntakes(supabase, id),
    listarAcomodacoesComPeriodos(supabase, id),
    listarPropostasDisponibilidade(supabase, tenantId, { supplierId: id, status: "pending_admin" }),
  ]);

  return (
    <div>
      <h2 className="mb-1 font-serif text-lg text-brand">Disponibilidade</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Datas de início (status e vagas) dos programas e janelas das acomodações. As alterações valem na
        hora — o mesmo que a escola vê no portal.
      </p>

      <PropostasDisponibilidadeBloco propostas={propostas} mostrarFornecedor={false} />
      <h3 className="mb-2 font-serif text-base text-brand">Programas</h3>
      <DisponibilidadeClient endpoint="/api/admin/disponibilidade" supplierId={id} programas={programas} />

      <h3 className="mb-2 mt-7 font-serif text-base text-brand">Acomodações</h3>
      <AcomodacaoClient endpoint="/api/admin/disponibilidade" supplierId={id} acomodacoes={acomodacoes} />
    </div>
  );
}
