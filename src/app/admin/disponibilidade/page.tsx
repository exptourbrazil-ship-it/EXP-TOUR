import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos } from "@/lib/catalog-disponibilidade";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";
import AcomodacaoClient from "@/components/AcomodacaoClient";
import FornecedorPicker from "./FornecedorPicker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Espelho admin da Disponibilidade: a equipe escolhe o fornecedor e gerencia os
// programas/datas dele. Autorizacao por capacidade fornecedores.gerir (a rota de
// API revalida). Mesmo componente do portal, endpoint admin (com supplierId).
export default async function AdminDisponibilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/disponibilidade");
  const { supplier: supplierId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: suppliers } = await supabase
    .from("supplier")
    .select("id, display_name")
    .order("display_name");

  const escolhido = (suppliers ?? []).find((s) => s.id === supplierId) ?? null;
  const [programas, acomodacoes] = escolhido
    ? await Promise.all([
        listarProgramasComIntakes(supabase, escolhido.id),
        listarAcomodacoesComPeriodos(supabase, escolhido.id),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Disponibilidade</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Gerencie os programas e as datas de início (status e vagas) de um fornecedor. As alterações
        valem na hora — o mesmo que a escola vê no portal.
      </p>

      <FornecedorPicker suppliers={suppliers ?? []} value={escolhido?.id ?? null} />

      {escolhido ? (
        <>
          <h2 className="mb-3 font-serif text-lg text-brand">{escolhido.display_name}</h2>
          <h3 className="mb-2 font-serif text-base text-brand">Programas</h3>
          <DisponibilidadeClient
            endpoint="/api/admin/disponibilidade"
            supplierId={escolhido.id}
            programas={programas}
          />
          <h3 className="mb-2 mt-7 font-serif text-base text-brand">Acomodações</h3>
          <AcomodacaoClient
            endpoint="/api/admin/disponibilidade"
            supplierId={escolhido.id}
            acomodacoes={acomodacoes}
          />
        </>
      ) : (
        <p className="text-sm text-neutral-500">Escolha um fornecedor para ver e editar a disponibilidade.</p>
      )}
    </div>
  );
}
