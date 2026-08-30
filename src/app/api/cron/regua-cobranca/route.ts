import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { janelaLembrete, janelaEhAtraso, janelaQuitacao, diasAteVencimento, janelasMoraAplicaveis } from "@/lib/regua";
import { dataLimiteQuitacao, saldoDevedorMoeda } from "@/lib/parcelas";
import { enviarLembreteCobrancaEmail, enviarLembreteQuitacaoEmail, enviarAvisoMoraEmail } from "@/lib/email";
import {
  calcularMoraSaldo,
  MORA_MULTA_PADRAO,
  MORA_JUROS_MES_PADRAO,
  MORA_INDICE_PADRAO,
} from "@/lib/mora";
import { slugDoTenant } from "@/lib/tenant-slug";
import { removerDeContratosCancelados, contratoCancelado } from "@/lib/cancelamento";
import { contratosComSuspensao } from "@/lib/excecao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Regua de cobranca (Vercel Cron, ver vercel.json).
//
// Uma vez por dia, varre as parcelas nao pagas e, quando o vencimento cai em
// uma das janelas (D-7, D-2, D+1, D+5), envia um lembrete por e-mail (Resend)
// com o valor, o vencimento e o codigo Pix (quando ja ha cobranca gerada).
//
// Idempotencia: cada (parcela, janela) so gera um lembrete. O envio e
// registrado em lembretes_cobranca (unique parcela_id+janela), evitando
// reenvio caso o cron rode mais de uma vez no mesmo dia. A cobranca cessa
// naturalmente porque parcelas pagas (status "pago" / paid_at) sao excluidas
// da varredura.

function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
  } catch {
    return `${moeda} ${valor.toFixed(2)}`;
  }
}

function isoMaisDias(base: Date, dias: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Falha FECHADO. Antes era `if (cronSecret && ...)`: se a variavel sumisse,
  // fosse renomeada ou ficasse vazia, a guarda era pulada e a rota virava
  // publica, sem nenhum sinal. Configuracao faltante agora recusa.
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);
  // Janela de busca: cobre de D+5 (venceu ha 5 dias) ate D-7 (vence em 7 dias).
  // Cobre de D+5 (venceu ha 5 dias) ate D-3 (vence em 3 dias).
  const minISO = isoMaisDias(hoje, -5);
  const maxISO = isoMaisDias(hoje, 3);

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || null;

  const { data: parcelas, error } = await supabase
    .from("parcelas")
    .select(
      "id, contrato_id, descricao, valor_atual, vencimento, status, payment_link, contrato:contratos(nome, moeda, cancelado_em, titular:titulares(email, nome_completo, tenant_id))"
    )
    .neq("status", "pago")
    .is("paid_at", null)
    .gte("vencimento", minISO)
    .lte("vencimento", maxISO);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler parcelas: " + error.message }, { status: 500 });
  }

  // Suspensao por excecao (doc 01 §4): um processo ativo que suspende "cobranca"
  // ou "lembretes" pausa a regua deste contrato — E1 (visto negado), E4/E6/E8
  // etc. Carregamos as excecoes ativas uma vez e montamos o conjunto de
  // contratos suspensos; a regua (parcela e quitacao) pula esses contratos. A
  // pausa CESSA sozinha quando a excecao e resolvida/cancelada (deixa de ser
  // ativa), sem precisar religar nada.
  const { data: excecoesAtivas, error: erroExcecoes } = await supabase
    .from("case_exceptions")
    .select("contrato_id, status, suspende")
    .in("status", ["aberta", "em_andamento"]);
  // Falha FECHADA: sem a lista de suspensoes nao da para saber quem esta em
  // processo (visto negado, cancelamento, forca maior...). Cobrar sem essa
  // informacao mandaria lembrete justamente a quem NAO pode ser cobrado — a
  // falha de empatia que o doc alerta. Melhor pular a execucao de hoje (a regua
  // roda todo dia; um dia de atraso e recuperavel) do que cobrar suspensos.
  if (erroExcecoes) {
    console.error("[regua-cobranca] falha ao ler excecoes ativas; execucao abortada:", erroExcecoes.message);
    return NextResponse.json(
      { ok: false, erro: "Falha ao ler suspensoes (excecoes); execucao abortada" },
      { status: 500 }
    );
  }
  const contratosSuspensos = contratosComSuspensao(
    (excecoesAtivas || []) as any[],
    ["cobranca", "lembretes"]
  );

  // Contrato cancelado nao gera cobranca. Sem este filtro, quem desistia
  // continuava recebendo lembrete de parcela pela regua automatica — nao havia
  // nada no modelo de dados que representasse o cancelamento.
  const parcelasAtivas = removerDeContratosCancelados((parcelas || []) as any[]);
  const puladasPorCancelamento = (parcelas || []).length - parcelasAtivas.length;

  const resultado = {
    data: hojeISO,
    analisadas: parcelasAtivas.length,
    contrato_cancelado: puladasPorCancelamento,
    suspensa_por_excecao: 0,
    enviados: 0,
    fora_da_janela: 0,
    sem_email: 0,
    ja_enviados: 0,
    erros: 0,
  };

  for (const p of parcelasAtivas) {
    // Contrato com processo de excecao suspendendo cobranca/lembretes: nao envia.
    if (contratosSuspensos.has((p as any).contrato_id)) {
      resultado.suspensa_por_excecao++;
      continue;
    }

    const janela = janelaLembrete(hojeISO, (p as any).vencimento);
    if (!janela) {
      resultado.fora_da_janela++;
      continue;
    }

    const contrato = (p as any).contrato;
    const titular = contrato?.titular;
    if (!titular?.email) {
      resultado.sem_email++;
      continue;
    }

    // Idempotencia: ja enviamos este lembrete para esta parcela/janela?
    const { data: existente } = await supabase
      .from("lembretes_cobranca")
      .select("id")
      .eq("parcela_id", p.id)
      .eq("janela", janela)
      .maybeSingle();
    if (existente) {
      resultado.ja_enviados++;
      continue;
    }

    const moeda = contrato?.moeda || "BRL";
    try {
      const slug = await slugDoTenant(supabase, titular.tenant_id);
      await enviarLembreteCobrancaEmail(titular.email, titular.nome_completo, {
        descricao: p.descricao,
        valor: formatarMoeda(Number(p.valor_atual), moeda),
        vencimento: formatarData(p.vencimento),
        vencida: janelaEhAtraso(janela),
        pixCode: p.payment_link || null,
        portalUrl,
      }, slug);

      // Registra o envio (a constraint unique parcela_id+janela e a garantia
      // final contra duplicidade mesmo sob execucoes concorrentes).
      const { error: erroInsert } = await supabase
        .from("lembretes_cobranca")
        .insert({ parcela_id: p.id, janela });
      if (erroInsert) {
        // Provavel conflito de unicidade (ja registrado por outra execucao):
        // o e-mail pode ter saido, mas nao contabilizamos como novo envio.
        resultado.ja_enviados++;
        continue;
      }
      resultado.enviados++;
    } catch {
      resultado.erros++;
    }
  }

  // ── Passo 2: regua de QUITACAO (Clausula 7.12) ────────────────────────────
  // Lembretes D-30/D-15/D-5 antes da data-limite de quitacao (que e D-30 do
  // inicio). As janelas caem em dataInicio - 60/45/35; filtramos os contratos
  // por data_inicio nessa faixa para varrer poucos registros. Cessa quando o
  // saldo devedor chega a zero. Idempotente por (contrato, janela).
  const quitacao = { analisados: 0, enviados: 0, sem_email: 0, ja_enviados: 0, sem_saldo: 0, contrato_cancelado: 0, suspensa_por_excecao: 0, erros: 0 };
  const inicioMin = isoMaisDias(hoje, 35);
  const inicioMax = isoMaisDias(hoje, 60);

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, moeda, data_inicio, cancelado_em, titular:titulares(email, nome_completo, tenant_id)")
    .is("cancelado_em", null)
    .not("data_inicio", "is", null)
    .gte("data_inicio", inicioMin)
    .lte("data_inicio", inicioMax);

  for (const c of contratos || []) {
    // Cinto e suspensorio: o filtro ja roda na query, mas contrato cancelado
    // tambem nao pode receber lembrete de quitacao se a query mudar um dia.
    if (contratoCancelado(c as any)) {
      quitacao.contrato_cancelado++;
      continue;
    }
    // Mesma suspensao por excecao da regua de parcelas.
    if (contratosSuspensos.has((c as any).id)) {
      quitacao.suspensa_por_excecao++;
      continue;
    }
    const dataLimite = dataLimiteQuitacao((c as any).data_inicio);
    const janela = janelaQuitacao(hojeISO, dataLimite);
    if (!janela) continue;
    quitacao.analisados++;

    const titular = (c as any).titular;
    if (!titular?.email) {
      quitacao.sem_email++;
      continue;
    }

    const { data: parc } = await supabase
      .from("parcelas")
      .select("valor_atual, status")
      .eq("contrato_id", (c as any).id);
    const saldo = saldoDevedorMoeda((parc || []) as any);
    if (saldo <= 0) {
      quitacao.sem_saldo++; // quitado -> a regua cessa naturalmente
      continue;
    }

    const { data: jaEnviado } = await supabase
      .from("lembretes_quitacao")
      .select("id")
      .eq("contrato_id", (c as any).id)
      .eq("janela", janela)
      .maybeSingle();
    if (jaEnviado) {
      quitacao.ja_enviados++;
      continue;
    }

    const moeda = (c as any).moeda || "BRL";
    const diasRestantes = diasAteVencimento(hojeISO, dataLimite as string) ?? 0;
    try {
      const slug = await slugDoTenant(supabase, titular.tenant_id);
      await enviarLembreteQuitacaoEmail(titular.email, titular.nome_completo, {
        saldo: formatarMoeda(saldo, moeda),
        dataLimite: formatarData(dataLimite as string),
        diasRestantes,
        portalUrl,
      }, slug);
      const { error: erroInsert } = await supabase
        .from("lembretes_quitacao")
        .insert({ contrato_id: (c as any).id, janela });
      if (erroInsert) {
        quitacao.ja_enviados++;
        continue;
      }
      quitacao.enviados++;
    } catch {
      quitacao.erros++;
    }
  }

  // ==========================================================================
  // Avisos AMIGAVEIS de mora (Clausula 13): >=2 comunicacoes APOS a data-limite
  // de quitacao, enquanto ha saldo. Idempotente por (contrato, janela) reusando
  // lembretes_quitacao (janelas 'mora_1'/'mora_2'). Nao suspende nem rescinde —
  // so comunica (a escalada de rescisao e o processo E5).
  // ==========================================================================
  const mora = { analisados: 0, enviados: 0, sem_email: 0, ja_enviados: 0, sem_saldo: 0, contrato_cancelado: 0, suspensa_por_excecao: 0, erros: 0 };
  const moraMulta = envMoraPct("MORA_MULTA_PERCENTUAL", MORA_MULTA_PADRAO);
  const moraJuros = envMoraPct("MORA_JUROS_MES_PERCENTUAL", MORA_JUROS_MES_PADRAO);
  const moraIndice = envMoraPct("MORA_INDICE_PERCENTUAL", MORA_INDICE_PADRAO);
  // Contratos com a data-limite ja vencida (data_inicio em [hoje-30, hoje+30] ->
  // data-limite em [hoje-60, hoje]); a janela de mora cobre o atraso ate ~60d.
  const moraInicioMin = isoMaisDias(hoje, -30);
  const moraInicioMax = isoMaisDias(hoje, 30);

  const { data: contratosMora, error: erroMora } = await supabase
    .from("contratos")
    .select("id, moeda, data_inicio, cancelado_em, titular:titulares(email, nome_completo, tenant_id)")
    .is("cancelado_em", null)
    .not("data_inicio", "is", null)
    .gte("data_inicio", moraInicioMin)
    .lte("data_inicio", moraInicioMax);
  if (erroMora) console.error("[regua-cobranca] falha ao carregar contratos para aviso de mora");

  for (const c of contratosMora || []) {
    if (contratoCancelado(c as any)) { mora.contrato_cancelado++; continue; }
    if (contratosSuspensos.has((c as any).id)) { mora.suspensa_por_excecao++; continue; }

    const dataLimite = dataLimiteQuitacao((c as any).data_inicio);
    const janelas = janelasMoraAplicaveis(hojeISO, dataLimite);
    if (janelas.length === 0) continue;
    mora.analisados++;

    const titular = (c as any).titular;
    if (!titular?.email) { mora.sem_email++; continue; }

    const { data: parc } = await supabase
      .from("parcelas")
      .select("valor_atual, status")
      .eq("contrato_id", (c as any).id);
    const saldo = saldoDevedorMoeda((parc || []) as any);
    if (saldo <= 0) { mora.sem_saldo++; continue; }

    const moeda = (c as any).moeda || "BRL";
    const diasAtraso = -(diasAteVencimento(hojeISO, dataLimite as string) ?? 0);
    const enc = calcularMoraSaldo({
      saldoMoeda: saldo,
      diasAtraso,
      multaPercent: moraMulta,
      jurosMesPercent: moraJuros,
      indicePercent: moraIndice,
    });

    // NO MAXIMO um aviso por execucao: o de MENOR limiar ainda nao enviado.
    // Espalha as >=2 comunicacoes em dias distintos (empatia da Clausula 13) e
    // evita dois e-mails no mesmo minuto quando o cron "pula" e ambos os limiares
    // ja foram cruzados — o proximo run cobre a janela seguinte.
    let tratou = false;
    for (const janela of janelas) {
      const { data: jaEnviado } = await supabase
        .from("lembretes_quitacao")
        .select("id")
        .eq("contrato_id", (c as any).id)
        .eq("janela", janela)
        .maybeSingle();
      if (jaEnviado) continue; // ja enviado -> tenta a proxima janela pendente
      try {
        const slug = await slugDoTenant(supabase, titular.tenant_id);
        await enviarAvisoMoraEmail(titular.email, titular.nome_completo, {
          saldo: formatarMoeda(saldo, moeda),
          encargos: formatarMoeda(enc.encargos, moeda),
          saldoComEncargos: formatarMoeda(enc.saldoComEncargos, moeda),
          diasAtraso,
          portalUrl,
        }, slug);
        const { error: erroInsert } = await supabase
          .from("lembretes_quitacao")
          .insert({ contrato_id: (c as any).id, janela });
        if (erroInsert) mora.ja_enviados++; // corrida: outra execucao registrou
        else mora.enviados++;
      } catch {
        // Best-effort: nao derruba o cron. Sem PII (nunca o e-mail) no log.
        console.error(`[regua-cobranca] falha ao enviar aviso de mora (contrato ${(c as any).id}, ${janela})`);
        mora.erros++;
      }
      tratou = true;
      break; // um aviso por execucao
    }
    if (!tratou) mora.ja_enviados++; // todas as janelas aplicaveis ja foram enviadas
  }

  return NextResponse.json({ ok: true, ...resultado, quitacao, mora });
}

// Percentual de mora VIGENTE por instancia (env; default de codigo como fallback).
function envMoraPct(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v >= 0 ? v : padrao;
}
