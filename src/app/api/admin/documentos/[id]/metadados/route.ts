import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarDocumentoForaDoEscopo } from "@/lib/admin-tenant";
import { ehTipoDocumentoValido, tipoTemValidade, tipoTemCobertura, tipoTemVoo } from "@/lib/documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Valida uma data de calendário REAL (não só o formato). Date.parse aceita
// "2026-02-30" fazendo roll-over — aqui remontamos em UTC e conferimos os
// componentes de volta, rejeitando datas impossíveis.
function ehDataCalendarioValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Metadados de Vistos de UM documento: data de validade (expiração) e tipo. É a
// INGESTÃO que alimenta os agentes de retaguarda de Vistos (validade vs.
// exigência do destino; carta de recusa e seu prazo de repasse). O detective só
// LÊ estes campos; quem os grava é o admin, aqui, por ação humana.
//
// Autorização por capacidade documentos.analisar (mesma da análise/compartilhar),
// escopo por tenant (barrarDocumentoForaDoEscopo), auditado. Atualização parcial:
// envie `validade` (YYYY-MM-DD ou null p/ limpar) e/ou `tipoDocumento`.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const temValidade = Object.prototype.hasOwnProperty.call(body, "validade");
  const temTipo = Object.prototype.hasOwnProperty.call(body, "tipoDocumento");
  const temCoberturaValor = Object.prototype.hasOwnProperty.call(body, "coberturaValor");
  const temCoberturaMoeda = Object.prototype.hasOwnProperty.call(body, "coberturaMoeda");
  const temVooIda = Object.prototype.hasOwnProperty.call(body, "vooIda");
  const temVooVolta = Object.prototype.hasOwnProperty.call(body, "vooVolta");
  const temVooCompra = Object.prototype.hasOwnProperty.call(body, "vooCompra");
  const temNome = Object.prototype.hasOwnProperty.call(body, "nome");
  const temNascimento = Object.prototype.hasOwnProperty.call(body, "dataNascimento");
  const temPassaporte = Object.prototype.hasOwnProperty.call(body, "passaporte");
  if (!temValidade && !temTipo && !temCoberturaValor && !temCoberturaMoeda && !temVooIda && !temVooVolta && !temVooCompra && !temNome && !temNascimento && !temPassaporte) {
    return NextResponse.json(
      { ok: false, error: "Informe ao menos um campo de metadados." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};

  if (temValidade) {
    const v = body.validade;
    if (v === null || v === "") {
      patch.validade = null;
    } else if (typeof v === "string" && ehDataCalendarioValida(v)) {
      patch.validade = v;
    } else {
      return NextResponse.json(
        { ok: false, error: "Validade inválida. Use o formato AAAA-MM-DD (data real) ou vazio para limpar." },
        { status: 400 },
      );
    }
  }

  if (temTipo) {
    const t = body.tipoDocumento;
    if (typeof t !== "string" || !ehTipoDocumentoValido(t)) {
      return NextResponse.json({ ok: false, error: "Tipo de documento inválido." }, { status: 400 });
    }
    patch.tipo_documento = t;
    // Reclassificar para um tipo SEM validade limpa a validade órfã: senão o
    // detective de Vistos (que olha qualquer doc com validade) seguiria sinalizando
    // com base numa data que não pertence mais ao documento (achado da revisão).
    // Só limpa quando o próprio request não está definindo uma validade.
    if (!tipoTemValidade(t) && !temValidade) {
      patch.validade = null;
    }
  }

  // Cobertura da apólice (agente de Seguro): valor + moeda. Só o agente de
  // cobertura lê estes campos (e só de docs seguro_saude), então não há
  // super-flag por deixá-los em outro tipo; valida mesmo assim.
  if (temCoberturaValor) {
    const v = body.coberturaValor;
    if (v === null || v === "") {
      patch.cobertura_valor = null;
    } else {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) patch.cobertura_valor = n;
      else return NextResponse.json({ ok: false, error: "Valor de cobertura inválido." }, { status: 400 });
    }
  }
  if (temCoberturaMoeda) {
    const m = body.coberturaMoeda;
    if (m === null || m === "") {
      patch.cobertura_moeda = null;
    } else if (typeof m === "string" && /^[A-Za-z]{2,5}$/.test(m)) {
      patch.cobertura_moeda = m.toUpperCase();
    } else {
      return NextResponse.json({ ok: false, error: "Moeda de cobertura inválida (use 2 a 5 letras)." }, { status: 400 });
    }
  }

  // Datas de voo (agente de Passagens). Mesma validação de data real da validade.
  for (const [flag, campo, valor] of [
    [temVooIda, "passagem_data_ida", body.vooIda],
    [temVooVolta, "passagem_data_volta", body.vooVolta],
    [temVooCompra, "passagem_data_compra", body.vooCompra],
  ] as const) {
    if (!flag) continue;
    if (valor === null || valor === "") {
      patch[campo] = null;
    } else if (typeof valor === "string" && ehDataCalendarioValida(valor)) {
      patch[campo] = valor;
    } else {
      return NextResponse.json(
        { ok: false, error: "Data de voo inválida. Use o formato AAAA-MM-DD (data real) ou vazio para limpar." },
        { status: 400 },
      );
    }
  }

  // Identidade extraída do documento (agente de Documentação): nome, data de
  // nascimento e passaporte. Aplicam-se a QUALQUER tipo de documento (não são
  // gated por tipo). O detective compara estes campos entre os documentos do
  // titular; aqui só validamos a forma. Limpar com null/"" é livre.
  if (temNome) {
    const v = body.nome;
    if (v === null || v === "") {
      patch.doc_nome = null;
    } else if (typeof v === "string" && v.trim().length > 0 && v.trim().length <= 200) {
      patch.doc_nome = v.trim();
    } else {
      return NextResponse.json({ ok: false, error: "Nome inválido (1 a 200 caracteres)." }, { status: 400 });
    }
  }
  if (temNascimento) {
    const v = body.dataNascimento;
    if (v === null || v === "") {
      patch.doc_data_nascimento = null;
    } else if (typeof v === "string" && ehDataCalendarioValida(v)) {
      patch.doc_data_nascimento = v;
    } else {
      return NextResponse.json(
        { ok: false, error: "Data de nascimento inválida. Use AAAA-MM-DD (data real) ou vazio para limpar." },
        { status: 400 },
      );
    }
  }
  if (temPassaporte) {
    const v = body.passaporte;
    if (v === null || v === "") {
      patch.doc_passaporte = null;
    } else if (typeof v === "string" && v.trim().length > 0 && v.trim().length <= 64) {
      // Guarda maiúsculo sem separadores (forma canônica; o motor normaliza igual).
      patch.doc_passaporte = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!patch.doc_passaporte) {
        return NextResponse.json({ ok: false, error: "Passaporte inválido (use letras e números)." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ ok: false, error: "Passaporte inválido (1 a 64 caracteres)." }, { status: 400 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  // Escopo por tenant: documento de outro tenant -> mesma resposta de inexistente.
  const barrado = await barrarDocumentoForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titular_id, tipo_documento, validade, cobertura_valor, cobertura_moeda, passagem_data_ida, passagem_data_volta, passagem_data_compra")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  // Cobertura só faz sentido em documento que a carrega (hoje, apólice de
  // seguro). Rejeita GRAVAR cobertura em outro tipo (limpar com null é livre) —
  // evita que a cobertura fique guardada em doc arbitrário à espera de um agente
  // futuro (achado da revisão).
  const tipoEfetivo = (patch.tipo_documento as string) ?? (doc as { tipo_documento?: string }).tipo_documento ?? "";
  const gravaCobertura = patch.cobertura_valor != null || patch.cobertura_moeda != null;
  if (gravaCobertura && !tipoTemCobertura(tipoEfetivo)) {
    return NextResponse.json(
      { ok: false, error: "Cobertura só se aplica à apólice de seguro." },
      { status: 422 },
    );
  }
  // Datas de voo só na passagem aérea (mesma lógica da cobertura). Limpar (null)
  // é livre; gravar data em outro tipo é recusado.
  const gravaVoo = patch.passagem_data_ida != null || patch.passagem_data_volta != null || patch.passagem_data_compra != null;
  if (gravaVoo && !tipoTemVoo(tipoEfetivo)) {
    return NextResponse.json(
      { ok: false, error: "Datas de voo só se aplicam à passagem aérea." },
      { status: 422 },
    );
  }

  const { error } = await supabase.from("documentos").update(patch).eq("id", id);
  if (error) {
    console.error("[documentos/metadados] update falhou:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao atualizar o documento." }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "documento.metadados",
    alvo: id,
    detalhe: {
      titular_id: doc.titular_id,
      // Antes/depois só dos campos efetivamente tocados no patch (inclui a
      // validade limpa automaticamente pela reclassificação).
      ...(temTipo ? { tipo_anterior: doc.tipo_documento, tipo_novo: patch.tipo_documento } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "validade")
        ? { validade_anterior: (doc as { validade?: string | null }).validade ?? null, validade_nova: patch.validade }
        : {}),
      ...(temCoberturaValor
        ? { cobertura_valor_anterior: (doc as { cobertura_valor?: number | null }).cobertura_valor ?? null, cobertura_valor_novo: patch.cobertura_valor }
        : {}),
      ...(temCoberturaMoeda
        ? { cobertura_moeda_anterior: (doc as { cobertura_moeda?: string | null }).cobertura_moeda ?? null, cobertura_moeda_nova: patch.cobertura_moeda }
        : {}),
      ...(temVooIda
        ? { voo_ida_anterior: (doc as { passagem_data_ida?: string | null }).passagem_data_ida ?? null, voo_ida_novo: patch.passagem_data_ida }
        : {}),
      ...(temVooVolta
        ? { voo_volta_anterior: (doc as { passagem_data_volta?: string | null }).passagem_data_volta ?? null, voo_volta_novo: patch.passagem_data_volta }
        : {}),
      ...(temVooCompra
        ? { voo_compra_anterior: (doc as { passagem_data_compra?: string | null }).passagem_data_compra ?? null, voo_compra_novo: patch.passagem_data_compra }
        : {}),
      // Identidade (nome, nascimento, passaporte) é PII: a trilha registra só QUE
      // o campo foi editado e se foi definido ou limpo — nunca o valor.
      ...(temNome ? { nome_editado: patch.doc_nome === null ? "limpo" : "definido" } : {}),
      ...(temNascimento ? { nascimento_editado: patch.doc_data_nascimento === null ? "limpo" : "definido" } : {}),
      ...(temPassaporte ? { passaporte_editado: patch.doc_passaporte === null ? "limpo" : "definido" } : {}),
    },
    ip: obterIp(request),
  });

  const validadeFinal = Object.prototype.hasOwnProperty.call(patch, "validade")
    ? (patch.validade as string | null)
    : ((doc as { validade?: string | null }).validade ?? null);
  return NextResponse.json({ ok: true, tipo_documento: patch.tipo_documento ?? doc.tipo_documento, validade: validadeFinal });
}
