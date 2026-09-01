import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarFicha } from "@/lib/ficha-matricula-service";
import FichaClient from "./FichaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ficha de Matricula bilingue (Clausulas 2.5e / 8.4) na Area do Cliente.
// Session-guarded + posse (o contrato tem de ser do titular) -> senao 404.
export default async function FichaPage({ params }: { params: Promise<{ contratoId: string }> }) {
  const { contratoId } = await params;
  const sessao = verificarSessao((await cookies()).get(SESSION_COOKIE)?.value);
  if (!sessao) redirect("/");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const estado = await carregarFicha(supabase, sessao.titularId, contratoId);
  if (!estado) notFound();

  return <FichaClient estado={estado} contratoId={contratoId} />;
}
