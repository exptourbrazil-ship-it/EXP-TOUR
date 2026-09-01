import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { solicitarRepactuacao, RepactuacaoBloqueada } from "@/lib/repactuacao-service";
import { obterIp } from "@/lib/rate-limit";
import type { ParcelaNova } from "@/lib/repactuacao";

export const runtime = "nodejs";

// Repactuacao do cronograma pelo proprio cliente (Clausula 7.11). O aceite
// eletronico e o ADITIVO — por isso a rota exige `aceite: true` e registra o IP.
// A posse (contrato do titular da sessao) e checada no servico; os guarda-corpos
// no motor puro. Self-service aplica na hora; a 3a+/trimestre fica pendente.

// Traduz o codigo de bloqueio do motor/servico numa mensagem ao cliente.
function mensagemMotivo(motivo: string, detalhe?: string): string {
  switch (motivo) {
    case "sem_parcelas":
      return "É preciso manter ao menos uma parcela.";
    case "parcela_em_atraso":
      return "Há uma parcela em atraso. Regularize o pagamento antes de repactuar.";
    case "valor_invalido":
      return "Cada parcela precisa de um valor maior que zero.";
    case "vencimento_invalido":
    case "vencimento_no_passado":
      return "Há uma parcela com data de vencimento inválida ou no passado.";
    case "parcela_bloqueada_alterada":
    case "parcela_bloqueada_removida":
      return "Uma parcela já paga ou com Pix gerado não pode ser alterada nem removida.";
    case "parcela_nao_encontrada":
      return "Uma das parcelas informadas não pertence a este contrato.";
    case "valor_abaixo_minimo":
      return `Cada parcela precisa ser de no mínimo ${detalhe ?? ""} na moeda do programa.`;
    case "parcela_iminente_alterada":
    case "parcela_iminente_removida":
    case "nova_parcela_iminente":
      return "A próxima parcela a vencer não pode ser alterada tão perto do vencimento. Deixe-a como está.";
    case "soma_diverge":
      return "A soma das parcelas precisa ser igual ao total contratado (a repactuação redistribui, não reduz a dívida).";
    case "total_indisponivel":
      return "Não foi possível confirmar o total da dívida deste contrato. Fale com o suporte.";
    case "regra_30_dias":
      return `O último pagamento precisa ser até ${detalhe ?? ""} (30 dias antes do início do programa).`;
    case "aceite_obrigatorio":
      return "É preciso aceitar o termo de repactuação para continuar.";
    case "ja_ha_pendente":
      return "Já há uma repactuação sua aguardando aprovação para este contrato.";
    case "posse":
    case "contrato_nao_encontrado":
      return "Contrato não encontrado.";
    default:
      return "Não foi possível concluir a repactuação.";
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão não autenticada" }, { status: 401 });
  }

  let corpo: { contratoId?: string; parcelas?: ParcelaNova[]; aceite?: boolean };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido" }, { status: 400 });
  }

  const contratoId = corpo.contratoId;
  const novas = Array.isArray(corpo.parcelas) ? corpo.parcelas : [];
  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "contratoId obrigatório" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const r = await solicitarRepactuacao({
      supabase,
      contratoId,
      titularId: sessao.titularId,
      novas,
      aceite: !!corpo.aceite,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, status: r.status, repactuacaoId: r.repactuacaoId });
  } catch (err) {
    if (err instanceof RepactuacaoBloqueada) {
      const ehPosse = err.codigo === "posse" || err.codigo === "contrato_nao_encontrado";
      const ehFalhaInterna = err.codigo.startsWith("falha_");
      const status = ehPosse ? 403 : ehFalhaInterna ? 500 : 400;
      // NAO vaza se o contrato existe (posse) ou nao (contrato_nao_encontrado):
      // mesmo status, mesma mensagem E mesmo `motivo` externo para os dois (evita
      // oraculo de enumeracao por IDOR). Falhas internas nao expoem o codigo.
      const motivo = ehPosse ? "nao_encontrado" : ehFalhaInterna ? "erro_interno" : err.codigo;
      return NextResponse.json(
        { ok: false, motivo, erro: mensagemMotivo(err.codigo, err.message) },
        { status },
      );
    }
    return NextResponse.json({ ok: false, erro: "Falha ao repactuar." }, { status: 500 });
  }
}
