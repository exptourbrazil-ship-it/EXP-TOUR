import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { montarChecklist, resolverConcluido, calcularProgresso } from "@/lib/embarque";
import EmbarqueClient from "./EmbarqueClient";

// Pagina do servidor (aba Embarque): monta o checklist de pre-embarque do
// destino do contrato. Itens de documento marcam sozinhos (pelo cofre); itens
// de tarefa vem das marcacoes manuais salvas em embarque_checklist.
export default async function EmbarquePage() {
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
    .select("id, nome, estudante_nome, pais_destino")
    .eq("titular_id", sessao.titularId)
    .order("id", { ascending: false });
  const contrato = (contratos && contratos[0]) || null;

  // Tipos de documento presentes no cofre do titular (para os itens automaticos).
  const { data: documentos } = await supabase
    .from("documentos")
    .select("tipo_documento")
    .eq("titular_id", sessao.titularId);
  const tiposPresentes = new Set((documentos || []).map((d: any) => d.tipo_documento));

  // Marcacoes manuais (tarefas) deste titular + contrato.
  const filtro = supabase
    .from("embarque_checklist")
    .select("item_chave, concluido")
    .eq("titular_id", sessao.titularId);
  const { data: marcacoes } = contrato
    ? await filtro.eq("contrato_id", contrato.id)
    : await filtro.is("contrato_id", null);
  const tarefasConcluidas = new Set(
    (marcacoes || []).filter((m: any) => m.concluido).map((m: any) => m.item_chave)
  );

  const itens = montarChecklist(contrato ? contrato.pais_destino : null);
  const itensComEstado = itens.map((item) => ({
    chave: item.chave,
    label: item.label,
    tipo: item.tipo,
    dica: item.dica || null,
    concluido: resolverConcluido(item, tiposPresentes, tarefasConcluidas),
  }));
  const progresso = calcularProgresso(itens, tiposPresentes, tarefasConcluidas);

  const nomeExibicao = (contrato && contrato.estudante_nome) ? contrato.estudante_nome : (titular ? titular.nome_completo : null);

  return (
    <EmbarqueClient
      nomeExibicao={nomeExibicao}
      contratoId={contrato ? contrato.id : null}
      itens={itensComEstado}
      progresso={progresso}
    />
  );
}
