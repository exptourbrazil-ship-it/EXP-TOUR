import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import { resumoViagem, type ViagemInfoParcial } from "@/lib/viagem";
import ViagemInfoClient from "./ViagemInfoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ContratoViagem = {
  id: string;
  nome: string | null;
  estudante_nome: string | null;
  pais_destino: string | null;
  titular_id: string | null;
  titular_nome: string | null;
  info: ViagemInfoParcial;
};

// Pagina protegida: preenche os dados da aba Viagem (viagem_info) de cada
// contrato — escola, acomodacao, contato local. Carrega no servidor (service
// role) e entrega a lista pronta; o salvamento continua via POST na rota
// /api/admin/viagem-info (gated por casos.gerir). A UI espelha a matriz RBAC:
// so quem tem casos.gerir vê o botao de salvar. A LEITURA e gateada por
// capacidade (casos.ver), nao so pela sessao — acompanha a matriz num lugar so.
export default async function AdminViagemPage() {
  const { papel } = await exigirCapacidade("casos.ver", "/admin/viagem");
  const podeGerir = podeAdmin(papel, "casos.gerir");

  let contratos: ContratoViagem[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: linhas } = await supabase
      .from("contratos")
      .select("id, nome, estudante_nome, pais_destino, titular_id")
      .order("estudante_nome", { ascending: true });

    const titularIds = Array.from(new Set((linhas || []).map((c: any) => c.titular_id).filter(Boolean)));
    const contratoIds = (linhas || []).map((c: any) => c.id);

    const titularPorId = new Map<string, string | null>();
    if (titularIds.length > 0) {
      const { data: ts } = await supabase.from("titulares").select("id, nome_completo").in("id", titularIds);
      for (const t of ts || []) titularPorId.set(t.id, t.nome_completo);
    }

    const infoPorContrato = new Map<string, ViagemInfoParcial>();
    if (contratoIds.length > 0) {
      const { data: infos } = await supabase
        .from("viagem_info")
        .select("contrato_id, escola_nome, escola_endereco, acomodacao_endereco, contato_local_nome, contato_local_telefone, observacoes")
        .in("contrato_id", contratoIds);
      for (const i of infos || []) {
        const { contrato_id, ...resto } = i as any;
        infoPorContrato.set(contrato_id, resto as ViagemInfoParcial);
      }
    }

    contratos = (linhas || []).map((c: any) => ({
      id: c.id,
      nome: c.nome,
      estudante_nome: c.estudante_nome,
      pais_destino: c.pais_destino,
      titular_id: c.titular_id ?? null,
      titular_nome: c.titular_id ? titularPorId.get(c.titular_id) ?? null : null,
      info: infoPorContrato.get(c.id) ?? null,
    }));
  } catch (err) {
    // Fail-safe de exibicao: renderiza vazio, mas loga sem PII para a falha de
    // infraestrutura nao passar despercebida (a lista some, nao trava a pagina).
    console.warn("[admin/viagem] falha ao carregar contratos:", err instanceof Error ? err.message : err);
    contratos = [];
  }

  const resumo = resumoViagem(contratos);

  return <ViagemInfoClient contratos={contratos} resumo={resumo} podeGerir={podeGerir} />;
}
