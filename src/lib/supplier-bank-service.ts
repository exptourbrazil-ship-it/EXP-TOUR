// Dados bancarios do fornecedor, para o REPASSE (contas-a-pagar). SERVER-ONLY
// (service role). Ate aqui o repasse era 100% manual: o admin transferia pelo
// proprio banco/gateway e so REGISTRAVA depois (supplier_payout.reference e
// texto livre) — nenhuma conta vinculada em lugar nenhum.
//
// Isto e dado de DESTINO de dinheiro: uma conta errada e fraude/prejuizo real,
// entao nenhuma proposta do fornecedor vira "a conta usada no repasse" sem
// confirmacao humana do admin (mesmo espirito do "dinheiro so muda de estado
// por webhook confirmado, nunca por tela" do pagamento do cliente — aqui quem
// confirma e o admin, nao um webhook, mas a garantia e a mesma: nunca
// automatico). Fluxo: fornecedor PROPOE (pending_admin, uma por vez — nova
// proposta atualiza a pendente existente) -> admin CONFIRMA (a confirmada
// anterior vira 'superseded', nunca apagada — historico auditavel) ou REJEITA
// (motivo obrigatorio). A confirmacao e ATOMICA via RPC
// confirmar_conta_bancaria_fornecedor (advisory lock por fornecedor + indice
// unico em status='confirmed'), mesmo padrao de substituir_elegibilidade.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  validarEntradaContaBancaria,
  type StatusContaBancaria,
  type ContaBancariaFornecedor,
  type Falha,
} from "@/lib/supplier-bank";

export type { StatusContaBancaria, ContaBancariaFornecedor, Falha };

const CAMPOS =
  "id, tenant_id, supplier_id, status, account_holder_name, bank_name, country_code, currency, iban, swift_bic, account_number, routing_code, pix_key, proposed_by, reviewed_by, reviewed_at, rejection_reason, notes, created_at, updated_at";

function mapLinha(r: any): ContaBancariaFornecedor {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    supplierId: r.supplier_id,
    status: r.status,
    accountHolderName: r.account_holder_name,
    bankName: r.bank_name ?? null,
    countryCode: r.country_code ?? null,
    currency: r.currency ?? null,
    iban: r.iban ?? null,
    swiftBic: r.swift_bic ?? null,
    accountNumber: r.account_number ?? null,
    routingCode: r.routing_code ?? null,
    pixKey: r.pix_key ?? null,
    proposedBy: r.proposed_by,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    rejectionReason: r.rejection_reason ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? null,
    supplierNome: r.supplier ? (Array.isArray(r.supplier) ? r.supplier[0]?.display_name : r.supplier.display_name) ?? null : undefined,
  };
}

// Confere que o fornecedor e do tenant (posse), antes de qualquer leitura/escrita.
async function supplierDoTenant(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<boolean> {
  const { data } = await supabase.from("supplier").select("id, tenant_id").eq("id", supplierId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// ── Fornecedor ───────────────────────────────────────────────────────────────

// Historico completo (todos os status) do fornecedor, do mais recente ao mais
// antigo — para a tela do proprio fornecedor ver o que esta confirmado/
// pendente/rejeitado/superado.
export async function listarContasBancariasFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<ContaBancariaFornecedor[]> {
  const { data } = await supabase
    .from("supplier_bank_account")
    .select(CAMPOS)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapLinha);
}

// Cria (ou atualiza, se ja houver uma) a proposta PENDENTE do fornecedor. So
// pode existir UMA pending_admin por vez: uma nova tentativa enquanto ha uma
// pendente ATUALIZA a existente em vez de duplicar (mais simples que permitir
// multiplas propostas concorrentes, e evita o admin ter que escolher entre
// duas propostas do mesmo fornecedor abertas ao mesmo tempo).
export async function propostaBancariaFornecedor(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; actor: string; entrada: unknown },
): Promise<{ ok: true; id: string } | { ok: false; erro: string; falhas?: Falha[] }> {
  const { tenantId, supplierId, actor } = args;
  if (!(await supplierDoTenant(supabase, tenantId, supplierId))) {
    return { ok: false, erro: "Fornecedor não encontrado." };
  }
  const v = validarEntradaContaBancaria(args.entrada);
  if (!v.ok) return { ok: false, erro: "Dados bancários inválidos.", falhas: v.falhas };

  const { data: pendente } = await supabase
    .from("supplier_bank_account")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("status", "pending_admin")
    .maybeSingle();

  if (pendente) {
    const { data, error } = await supabase
      .from("supplier_bank_account")
      .update({ ...v.valor, proposed_by: actor, updated_at: new Date().toISOString() })
      .eq("id", (pendente as { id: string }).id)
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .eq("status", "pending_admin") // defesa em profundidade: nao atualiza se o admin decidiu entre a leitura e aqui
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, erro: "Esta proposta já está em análise — não é mais editável. Aguarde a decisão do administrador." };
    }
    return { ok: true, id: (data as { id: string }).id };
  }

  const { data, error } = await supabase
    .from("supplier_bank_account")
    .insert({ tenant_id: tenantId, supplier_id: supplierId, status: "pending_admin", proposed_by: actor, ...v.valor })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[supplier-bank] criar proposta:", error?.message);
    return { ok: false, erro: "Falha ao enviar a proposta." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// ── Admin ────────────────────────────────────────────────────────────────────

// Fila do admin: todas as propostas pending_admin de todos os fornecedores do
// tenant (fila central de revisao), da mais antiga a mais nova.
export async function listarPropostasBancariasPendentesAdmin(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ContaBancariaFornecedor[]> {
  const { data } = await supabase
    .from("supplier_bank_account")
    .select(`${CAMPOS}, supplier:supplier(display_name)`)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapLinha);
}

// Uma linha por id (posse por tenant). Usada pela tela de revisao do admin.
export async function obterContaBancaria(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<ContaBancariaFornecedor | null> {
  const { data } = await supabase
    .from("supplier_bank_account")
    .select(`${CAMPOS}, supplier:supplier(display_name)`)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? mapLinha(data) : null;
}

// Confirma a proposta como a conta VIGENTE do fornecedor. Transacional via RPC
// (avoid corrida entre dois admins confirmando propostas do mesmo fornecedor
// ao mesmo tempo): rebaixa a 'confirmed' atual para 'superseded' e promove
// esta para 'confirmed', tudo sob advisory lock + indice unico no banco. Falha
// fechada: se a funcao ainda nao foi aplicada (migracao ausente), RECUSA em vez
// de degradar para um update nao-transacional (que abriria janela de corrida
// para duas contas 'confirmed' simultaneas).
export async function confirmarContaBancaria(
  supabase: SupabaseClient,
  args: { tenantId: string; adminActor: string; ip?: string | null; id: string },
): Promise<{ ok: true; supplierId: string } | { ok: false; erro: string }> {
  const { tenantId, adminActor, id } = args;
  const antes = await obterContaBancaria(supabase, tenantId, id);
  if (!antes) return { ok: false, erro: "Proposta não encontrada." };
  if (antes.status !== "pending_admin") {
    return { ok: false, erro: "Esta proposta já foi decidida por outro administrador." };
  }

  const { data, error } = await supabase.rpc("confirmar_conta_bancaria_fornecedor", {
    p_tenant_id: tenantId,
    p_id: id,
    p_reviewed_by: adminActor,
  });
  if (error) {
    if ((error as { code?: string }).code === "PGRST202") {
      console.error("[supplier-bank] funcao confirmar_conta_bancaria_fornecedor ausente (aplicar migracao)");
      return { ok: false, erro: "Recurso de confirmação ainda não disponível (migração pendente). Contate o suporte técnico." };
    }
    console.error("[supplier-bank] rpc confirmar:", error.message);
    return { ok: false, erro: "Falha ao confirmar a conta." };
  }
  if (data !== true) {
    return { ok: false, erro: "Esta proposta já foi decidida por outro administrador." };
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminActor,
    acao: "fornecedor.conta_bancaria.confirmar",
    alvo: id,
    detalhe: {
      supplier_id: antes.supplierId,
      antes: { status: antes.status },
      depois: { status: "confirmed" },
      account_holder_name: antes.accountHolderName,
      country_code: antes.countryCode,
      currency: antes.currency,
      // Nunca gravar o numero completo da conta/IBAN/Pix na trilha — so o
      // suficiente para auditar QUAL conta foi confirmada, sem expor o dado
      // sensivel em claro no log de auditoria.
      identificador_mascarado: mascarar(antes),
    },
    ip: args.ip ?? null,
  });
  return { ok: true, supplierId: antes.supplierId };
}

// Rejeita a proposta (exige motivo). Nunca decide sozinha duas vezes: so age
// se ainda estiver pending_admin (CAS via .eq("status", ...) na propria escrita).
export async function rejeitarContaBancaria(
  supabase: SupabaseClient,
  args: { tenantId: string; adminActor: string; ip?: string | null; id: string; motivo: string },
): Promise<{ ok: true; supplierId: string } | { ok: false; erro: string }> {
  const { tenantId, adminActor, id } = args;
  const motivo = args.motivo.trim();
  if (!motivo) return { ok: false, erro: "Informe o motivo da recusa." };

  const antes = await obterContaBancaria(supabase, tenantId, id);
  if (!antes) return { ok: false, erro: "Proposta não encontrada." };
  if (antes.status !== "pending_admin") return { ok: false, erro: "Esta proposta já foi decidida por outro administrador." };

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("supplier_bank_account")
    .update({ status: "rejected", reviewed_by: adminActor, reviewed_at: agora, rejection_reason: motivo.slice(0, 1000), updated_at: agora })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (error) {
    console.error("[supplier-bank] rejeitar:", error.message);
    return { ok: false, erro: "Falha ao recusar a proposta." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Esta proposta já foi decidida por outro administrador." };

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminActor,
    acao: "fornecedor.conta_bancaria.rejeitar",
    alvo: id,
    detalhe: { supplier_id: antes.supplierId, motivo: motivo.slice(0, 1000) },
    ip: args.ip ?? null,
  });
  return { ok: true, supplierId: antes.supplierId };
}

// Mascara o identificador de conta para a trilha de auditoria (so os ultimos 4
// caracteres, o resto some) — a auditoria precisa provar QUAL conta foi
// confirmada sem guardar o dado sensivel em claro num log.
function mascarar(c: ContaBancariaFornecedor): string {
  const v = c.iban || c.pixKey || c.accountNumber || "";
  if (!v) return "—";
  const tail = v.slice(-4);
  return `•••${tail}`;
}
