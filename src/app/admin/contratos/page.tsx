import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/admin-guard";
import { signTemplateConfigurado } from "@/lib/sign-template";
import ContratosClient from "./ContratosClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ContratoLista = {
  id: string;
  nome: string | null;
  estudante_nome: string | null;
  pais_destino: string | null;
  moeda: string | null;
  valor_total: number | string | null;
  titular_nome: string | null;
  titular_email: string | null;
  assinatura_status: string | null;
  cancelado_em: string | null;
  cancelado_tipo: string | null;
  cancelado_motivo: string | null;
};

// Pagina de contratos: lista os contratos com o status da assinatura e permite
// enviar para o Zoho Sign (passo 7). Carrega no servidor; o client cuida do
// envio e do estado dos botoes.
export default async function AdminContratosPage() {
  await exigirAdmin("/admin/contratos");

  let contratos: ContratoLista[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: linhas } = await supabase
      .from("contratos")
      .select("id, nome, estudante_nome, pais_destino, moeda, valor_total, titular_id, cancelado_em, cancelado_tipo, cancelado_motivo")
      .order("created_at", { ascending: false });

    const titularIds = Array.from(new Set((linhas || []).map((c: any) => c.titular_id).filter(Boolean)));
    const contratoIds = (linhas || []).map((c: any) => c.id);

    const titularPorId = new Map<string, { nome: string | null; email: string | null }>();
    if (titularIds.length > 0) {
      const { data: ts } = await supabase
        .from("titulares")
        .select("id, nome_completo, email")
        .in("id", titularIds);
      for (const t of ts || []) titularPorId.set(t.id, { nome: t.nome_completo, email: t.email });
    }

    // Status da assinatura mais recente por contrato.
    const statusPorContrato = new Map<string, string>();
    if (contratoIds.length > 0) {
      const { data: assinaturas } = await supabase
        .from("contratos_assinatura")
        .select("contrato_id, status, criado_em")
        .in("contrato_id", contratoIds)
        .order("criado_em", { ascending: false });
      for (const a of assinaturas || []) {
        if (!statusPorContrato.has(a.contrato_id)) statusPorContrato.set(a.contrato_id, a.status);
      }
    }

    contratos = (linhas || []).map((c: any) => {
      const t = titularPorId.get(c.titular_id) || { nome: null, email: null };
      return {
        id: c.id,
        nome: c.nome,
        estudante_nome: c.estudante_nome,
        pais_destino: c.pais_destino,
        moeda: c.moeda,
        valor_total: c.valor_total,
        titular_nome: t.nome,
        titular_email: t.email,
        assinatura_status: statusPorContrato.get(c.id) || null,
        cancelado_em: c.cancelado_em ?? null,
        cancelado_tipo: c.cancelado_tipo ?? null,
        cancelado_motivo: c.cancelado_motivo ?? null,
      };
    });
  } catch {
    contratos = [];
  }

  return <ContratosClient contratos={contratos} templateConfigurado={signTemplateConfigurado()} />;
}
