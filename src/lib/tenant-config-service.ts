// Config institucional do tenant ("Sobre nós" + contato) exibida na aba
// "Sobre nós" da cotação (portal /p/[token]). SERVER-ONLY (service role).
// about_us_html é barrado na gravação (htmlPerigoso) e sanitizado no render
// (getPublicQuote → sanitizarHtml).
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlPerigoso } from "@/lib/produto-conteudo";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export type ConfigMarca = {
  nome: string;
  aboutUsHtml: string;
  website: string;
  address: string;
  email: string;
  phone: string;
};

const MAX_ABOUT = 20000;
const corta = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function obterConfigMarca(supabase: SupabaseClient, tenantId: string): Promise<ConfigMarca | null> {
  const { data } = await supabase
    .from("tenant")
    .select("name, about_us_html, website, address, contact_email, contact_phone")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    nome: (data.name as string) ?? "",
    aboutUsHtml: (data.about_us_html as string) ?? "",
    website: (data.website as string) ?? "",
    address: (data.address as string) ?? "",
    email: (data.contact_email as string) ?? "",
    phone: (data.contact_phone as string) ?? "",
  };
}

export type SalvarConfigMarcaArgs = {
  aboutUsHtml: unknown;
  website: unknown;
  address: unknown;
  email: unknown;
  phone: unknown;
};

export async function salvarConfigMarca(
  supabase: SupabaseClient,
  tenantId: string,
  args: SalvarConfigMarcaArgs,
  actor: string,
  ip?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const aboutUsHtml = corta(args.aboutUsHtml, MAX_ABOUT);
  if (aboutUsHtml && htmlPerigoso(aboutUsHtml)) {
    return { ok: false, erro: "O texto tem HTML não permitido (script/handler/iframe). Use apenas formatação simples." };
  }
  const website = corta(args.website, 300);
  const address = corta(args.address, 500);
  const email = corta(args.email, 254);
  const phone = corta(args.phone, 40);

  const { error } = await supabase
    .from("tenant")
    .update({
      about_us_html: aboutUsHtml || null,
      website: website || null,
      address: address || null,
      contact_email: email || null,
      contact_phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
  if (error) return { ok: false, erro: "Falha ao salvar a configuração." };

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "config.marca.salvar",
    alvo: tenantId,
    detalhe: { about_len: aboutUsHtml.length, tem_contato: !!(website || address || email || phone) },
    ip: ip ?? null,
  });
  return { ok: true };
}
