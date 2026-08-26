import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import { carregarCaso } from "@/lib/admin-caso";
import CasoClient from "./CasoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caso 360 (docs/07, Secao 3.2): tudo de um titular numa pagina. Carrega no
// servidor (service role) e entrega dados planos para o client component.
// Autorizacao por capacidade, nunca por papel direto. As Acoes (FATIA 2) sao
// gateadas por capacidade tanto aqui (permissoes -> UI) quanto na rota de API.
const ABAS_VALIDAS = ["jornada", "financeiro", "documentos", "comunicacao", "eventos", "acoes"] as const;
type AbaValida = (typeof ABAS_VALIDAS)[number];

export default async function CasoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { papel } = await exigirCapacidade("casos.ver", `/admin/clientes/${id}`);

  // Aba inicial via deep-link da Fila do Dia (?aba=), validada contra a lista.
  const sp = searchParams ? await searchParams : undefined;
  const abaInicial = (ABAS_VALIDAS as readonly string[]).includes(sp?.aba ?? "")
    ? (sp!.aba as AbaValida)
    : undefined;

  const caso = await carregarCaso(id);
  if (!caso) notFound();

  // Espelho da matriz RBAC para a UI: quais acoes este papel pode disparar.
  // A rota de API revalida a capacidade — isto so decide o que mostrar/habilitar.
  const permissoes = {
    analisarDocumentos: podeAdmin(papel, "documentos.analisar"),
    gerirCaso: podeAdmin(papel, "casos.gerir"),
    gerirCancelamento: podeAdmin(papel, "cancelamento.gerir"),
    gerirFinanceiro: podeAdmin(papel, "financeiro.gerir"),
    editarCpf: podeAdmin(papel, "override"),
  };

  return <CasoClient caso={caso} permissoes={permissoes} abaInicial={abaInicial} />;
}
