import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarReembolsoContrato } from "@/lib/reembolso-service";
import ReembolsoClient from "./ReembolsoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calculadora de reembolso do Anexo I (Cláusula 9), no admin. Gateada pela
// capacidade cancelamento.gerir (RBAC). Simula a retenção escalonada + memória
// de cálculo; a execução do refund segue pelo motor de acerto (por webhook).
export default async function ReembolsoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("cancelamento.gerir", `/admin/contratos/${id}/reembolso`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const inicial = await carregarReembolsoContrato(supabase, id);
  if (!inicial) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4">
        <Link href="/admin/contratos" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Contratos
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">Reembolso — Anexo I</h1>
        <p className="text-sm text-neutral-600">{inicial.programaNome}</p>
      </div>
      <ReembolsoClient inicial={inicial} />
    </div>
  );
}
