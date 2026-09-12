import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import { signTemplateConfigurado } from "@/lib/sign-template";
import { statusMaisRecentePorContrato } from "@/lib/contratos";
import { deriveEstadoContrato, estadoValido, rotuloEstado, type EstadoContrato } from "@/lib/contrato-estados";
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
  titular_id: string | null;
  titular_nome: string | null;
  titular_email: string | null;
  assinatura_status: string | null;
  cancelado_em: string | null;
  cancelado_tipo: string | null;
  cancelado_motivo: string | null;
  estado: string | null;
  estado_rotulo: string | null;
};

// Pagina de contratos: lista os contratos com o status da assinatura e permite
// enviar para o Zoho Sign (passo 7). Carrega no servidor; o client cuida do
// envio e do estado dos botoes. As rotas de mutacao ja revalidam a capacidade;
// aqui espelhamos a matriz RBAC para so mostrar/habilitar a acao que o papel
// pode disparar (mesmo padrao do Caso 360).
export default async function AdminContratosPage() {
  const { papel } = await exigirAdmin("/admin/contratos");
  const permissoes = {
    enviarAssinatura: podeAdmin(papel, "propostas.gerir"),
    cancelar: podeAdmin(papel, "cancelamento.gerir"),
  };

  let contratos: ContratoLista[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: linhas } = await supabase
      .from("contratos")
      .select("id, nome, estudante_nome, pais_destino, moeda, valor_total, titular_id, cancelado_em, cancelado_tipo, cancelado_motivo, estado, visto_status, data_inicio")
      .order("created_at", { ascending: false });

    const titularIds = Array.from(new Set((linhas || []).map((c: any) => c.titular_id).filter(Boolean)));
    const contratoIds = (linhas || []).map((c: any) => c.id);

    // Estado da máquina (P1): usa o PERSISTIDO quando existe; senão DERIVA dos
    // fatos. Para a lista inteira, carrega os fatos em LOTE (uma consulta de
    // parcelas + uma de aceites), não por linha.
    const entradaPagaPorContrato = new Map<string, boolean>();
    if (contratoIds.length > 0) {
      const { data: parcelas } = await supabase
        .from("parcelas")
        .select("contrato_id, status")
        .in("contrato_id", contratoIds)
        .eq("status", "pago");
      for (const p of parcelas || []) entradaPagaPorContrato.set(p.contrato_id, true);
    }
    const aceitePorTitular = new Map<string, string>();
    if (titularIds.length > 0) {
      const { data: aceites } = await supabase
        .from("aceites")
        .select("titular_id, data_hora")
        .in("titular_id", titularIds)
        .order("data_hora", { ascending: true });
      for (const a of aceites || []) {
        if (a.titular_id && !aceitePorTitular.has(a.titular_id)) aceitePorTitular.set(a.titular_id, a.data_hora);
      }
    }
    const agoraISO = new Date().toISOString();
    const estadoPorContrato = new Map<string, EstadoContrato>();
    for (const c of linhas || []) {
      const persistido = typeof c.estado === "string" && estadoValido(c.estado) ? (c.estado as EstadoContrato) : null;
      estadoPorContrato.set(
        c.id,
        persistido ??
          deriveEstadoContrato({
            agoraISO,
            canceladoEm: c.cancelado_em ?? null,
            entradaPaga: entradaPagaPorContrato.get(c.id) === true,
            aceiteTermoEm: c.titular_id ? aceitePorTitular.get(c.titular_id) ?? null : null,
            vistoStatus:
              c.visto_status === "em_analise" || c.visto_status === "aprovado" || c.visto_status === "negado"
                ? c.visto_status
                : null,
            dataInicioISO: c.data_inicio ?? null,
          }),
      );
    }

    const titularPorId = new Map<string, { nome: string | null; email: string | null }>();
    if (titularIds.length > 0) {
      const { data: ts } = await supabase
        .from("titulares")
        .select("id, nome_completo, email")
        .in("id", titularIds);
      for (const t of ts || []) titularPorId.set(t.id, { nome: t.nome_completo, email: t.email });
    }

    // Status da assinatura mais recente por contrato (helper puro, testado).
    let statusPorContrato: Record<string, string> = {};
    if (contratoIds.length > 0) {
      const { data: assinaturas } = await supabase
        .from("contratos_assinatura")
        .select("contrato_id, status, criado_em")
        .in("contrato_id", contratoIds);
      statusPorContrato = statusMaisRecentePorContrato((assinaturas || []) as any);
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
        titular_id: c.titular_id ?? null,
        titular_nome: t.nome,
        titular_email: t.email,
        assinatura_status: statusPorContrato[c.id] || null,
        cancelado_em: c.cancelado_em ?? null,
        cancelado_tipo: c.cancelado_tipo ?? null,
        cancelado_motivo: c.cancelado_motivo ?? null,
        estado: estadoPorContrato.get(c.id) ?? null,
        estado_rotulo: (() => {
          const e = estadoPorContrato.get(c.id);
          return e ? rotuloEstado(e) : null;
        })(),
      };
    });
  } catch {
    contratos = [];
  }

  return (
    <ContratosClient
      contratos={contratos}
      templateConfigurado={signTemplateConfigurado()}
      permissoes={permissoes}
    />
  );
}
