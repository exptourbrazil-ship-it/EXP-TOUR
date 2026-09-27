import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A tela "Marca" (favicon + logo + redes sociais) foi unificada com "Sobre a
// instituição" numa tela só (ver /fornecedor/instituicao/page.tsx — a seção
// "Ícone, logo e redes sociais" é o MarcaFornecedorEditor, ainda neste
// diretório e importado de lá). Esta rota fica só como redirecionamento para
// não quebrar links/favoritos antigos para /fornecedor/marca.
export default function MarcaFornecedorPageRedirect(): never {
  redirect("/fornecedor/instituicao");
}
