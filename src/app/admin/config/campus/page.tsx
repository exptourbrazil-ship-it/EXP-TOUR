import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/admin-guard";
import { listarCamposDoEscopo } from "@/lib/anexo3-admin-service";
import CampusConfigClient from "./CampusConfigClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CampusOpcao = { id: string; nome: string; local: string; moeda: string };

// Config por CAMPUS do Anexo III v3.1 (só Gestor): política de reembolso/intake,
// taxas obrigatórias e exigência de antecipação. Carrega os campi do escopo do
// admin; o client faz o CRUD via /api/admin/config/*.
export default async function AdminCampusConfigPage() {
  await exigirAdmin("/admin/config/campus");

  let campi: CampusOpcao[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const r = await listarCamposDoEscopo(supabase);
    if (r.ok) {
      campi = (r.data as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        nome: (c.name as string) || "(sem nome)",
        local: [c.city, c.country_code].filter(Boolean).join(" · "),
        moeda: ((c.base_currency as string) || "").toUpperCase(),
      }));
    }
  } catch {
    /* sem campi (migração/env) — a tela mostra estado vazio */
  }

  return <CampusConfigClient campi={campi} />;
}
