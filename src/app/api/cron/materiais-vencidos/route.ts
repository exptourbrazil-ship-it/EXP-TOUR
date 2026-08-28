import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { materiaisVencidos } from "@/lib/material-service";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron da validade dos materiais (doc 06 §3.3): material vencido "sai de
// circulação" (já filtrado das telas de cliente/admin) e gera pendência
// "atualizar material" ao fornecedor. Uma vez por dia. Idempotente: cada
// (material + validade) só vira e-mail UMA vez (chave no ledger events). Falha
// FECHADO: sem CRON_SECRET, recusa.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const hoje = new Date().toISOString().slice(0, 10);

  const vencidos = await materiaisVencidos(supabase, hoje);
  const resultado = { vencidos: vencidos.length, novos: 0, enviados: 0, erros: 0, sem_destinatario: 0 };
  if (vencidos.length === 0) return NextResponse.json({ ok: true, ...resultado });

  // Agrupa por fornecedor.
  const porSupplier = new Map<string, { id: string; titulo: string; validade: string | null }[]>();
  for (const m of vencidos) {
    const arr = porSupplier.get(m.supplierId) ?? [];
    arr.push({ id: m.id, titulo: m.titulo, validade: m.validade });
    porSupplier.set(m.supplierId, arr);
  }

  // Destinatários: marketing + admin do fornecedor, ativos.
  const supplierIds = [...porSupplier.keys()];
  const { data: usuarios } = await supabase
    .from("supplier_user")
    .select("supplier_id, email, name, role, language, active")
    .in("supplier_id", supplierIds)
    .eq("active", true)
    .is("archived_at", null);
  const destPorSupplier = new Map<string, { email: string; name: string | null; language: string | null }[]>();
  for (const u of (usuarios ?? []) as any[]) {
    if (!u.email || !(u.role === "marketing" || u.role === "supplier_admin")) continue;
    const arr = destPorSupplier.get(u.supplier_id) ?? [];
    arr.push({ email: u.email, name: u.name, language: u.language });
    destPorSupplier.set(u.supplier_id, arr);
  }

  for (const [supplierId, itens] of porSupplier) {
    const dest = destPorSupplier.get(supplierId) ?? [];
    // Sem destinatário: NÃO reivindica (será reprocessado quando houver contato).
    if (dest.length === 0) { resultado.sem_destinatario += itens.length; continue; }

    // Reivindica cada material como 'pendente' (só marca 'processado' após enviar).
    const claimedIds: string[] = [];
    const titulos: string[] = [];
    for (const it of itens) {
      const { data, error } = await supabase
        .from("events")
        .insert({
          source: "portal_fornecedor",
          event_type: "material_vencido",
          idempotency_key: `material_vencido:${it.id}:${it.validade ?? "?"}`,
          external_id: supplierId,
          payload: { material_id: it.id, supplier_id: supplierId, validade: it.validade },
          status: "pendente",
        })
        .select("id")
        .single();
      if (error || !data) continue; // 23505 (já avisado) ou falha -> pula
      claimedIds.push(data.id);
      titulos.push(it.titulo);
    }
    if (claimedIds.length === 0) continue;
    resultado.novos += claimedIds.length;

    const lista = titulos.slice(0, 20).join(", ");
    let algumOk = false;
    for (const d of dest) {
      const en = d.language !== "pt";
      try {
        await enviarAlertaFornecedorEmail(d.email, d.name || "", d.language || "en", {
          subject: en ? "Materials need updating" : "Materiais precisam de atualização",
          titulo: en ? "Expired materials" : "Materiais vencidos",
          contexto: en
            ? `Some materials have expired and are no longer shown to clients: ${lista}. Please upload updated versions.`
            : `Alguns materiais venceram e saíram de circulação: ${lista}. Envie versões atualizadas.`,
          botaoLabel: en ? "Update materials" : "Atualizar materiais",
          botaoUrl: `${base}/fornecedor/materiais`,
        });
        resultado.enviados++;
        algumOk = true;
      } catch {
        resultado.erros++;
      }
    }

    if (algumOk) {
      // Envio confirmado -> marca os eventos como processados.
      await supabase.from("events").update({ status: "processado", processed_at: new Date().toISOString() }).in("id", claimedIds);
    } else {
      // Nenhum e-mail saiu -> LIBERA a reivindicação (apaga os eventos) para o
      // cron tentar de novo amanhã (nunca perde o aviso por falha transitória).
      await supabase.from("events").delete().in("id", claimedIds);
      resultado.novos -= claimedIds.length;
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
