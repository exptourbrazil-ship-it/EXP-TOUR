import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { emergenciaDoDestino } from "@/lib/viagem";
import { listarMateriaisCliente } from "@/lib/material-service";
import ViagemClient from "./ViagemClient";

// Pagina do servidor (aba Viagem): contatos da EXP Tour, emergencia do destino,
// escola/acomodacao (dados estruturados em viagem_info) e botoes de parceiros
// (moeda e chip). Os documentos ficam apenas na aba Docs.
export default async function ViagemPage() {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    redirect("/");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, nome, estudante_nome, pais_destino, supplier_id")
    .is("cancelado_em", null)
    .eq("titular_id", sessao.titularId)
    .order("id", { ascending: false });
  const contrato = (contratos && contratos[0]) || null;

  // Materiais que as escolas contratadas liberaram ao cliente (ativos, não
  // vencidos). Une TODAS as escolas dos contratos não cancelados (mesmo escopo
  // da rota de download), deduplicando por material.
  const hoje = new Date().toISOString().slice(0, 10);
  const supplierIds = [...new Set(((contratos ?? []) as { supplier_id?: string | null }[]).map((c) => c.supplier_id).filter(Boolean))] as string[];
  const vistos = new Set<string>();
  const materiais: { id: string; tipo: string; titulo: string; temArquivo: boolean; linkUrl: string | null }[] = [];
  for (const sid of supplierIds) {
    for (const m of await listarMateriaisCliente(supabase, sid, hoje)) {
      if (vistos.has(m.id)) continue;
      vistos.add(m.id);
      materiais.push({ id: m.id, tipo: m.tipo, titulo: m.titulo, temArquivo: m.temArquivo, linkUrl: m.linkUrl });
    }
  }

  // Dados estruturados da viagem (escola/acomodacao/contato local).
  const { data: info } = contrato
    ? await supabase
        .from("viagem_info")
        .select("escola_nome, escola_endereco, acomodacao_endereco, contato_local_nome, contato_local_telefone, observacoes")
        .eq("contrato_id", contrato.id)
        .maybeSingle()
    : { data: null };

  const emergencia = emergenciaDoDestino(contrato ? contrato.pais_destino : null);
  const nomeExibicao = (contrato && contrato.estudante_nome) ? contrato.estudante_nome : (titular ? titular.nome_completo : null);

  // Links de afiliados (parceiros). Cada botao so aparece se a env existir.
  const afiliadoMoedaUrl = process.env.NEXT_PUBLIC_AFILIADO_MOEDA_URL || null;
  const afiliadoChipUrl = process.env.NEXT_PUBLIC_AFILIADO_CHIP_URL || null;
  const afiliadoPassagemUrl = process.env.NEXT_PUBLIC_AFILIADO_PASSAGEM_URL || null;

  return (
    <ViagemClient
      nomeExibicao={nomeExibicao}
      emergencia={emergencia}
      info={info || null}
      afiliadoMoedaUrl={afiliadoMoedaUrl}
      afiliadoChipUrl={afiliadoChipUrl}
      afiliadoPassagemUrl={afiliadoPassagemUrl}
      materiais={materiais}
    />
  );
}
