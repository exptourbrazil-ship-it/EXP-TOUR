import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterConfigMarca } from "@/lib/tenant-config-service";
import SobreNosForm from "./SobreNosForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config do institucional "Sobre nós" + contato do tenant (aba "Sobre nós" da
// cotação). Só Gestor (config.gerir).
export default async function AdminSobreNosPage() {
  await exigirCapacidade("config.gerir", "/admin/sobre-nos");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const config = await obterConfigMarca(supabase, tenantId);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Configuração</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Sobre nós</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Texto institucional e contato de {config?.nome || "sua agência"}, exibidos na aba
          &ldquo;Sobre nós&rdquo; do link da cotação enviado ao lead.
        </p>
      </header>
      {config ? <SobreNosForm inicial={config} /> : (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar a configuração.</p>
      )}
    </div>
  );
}
