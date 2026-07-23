import { exigirAdmin } from "@/lib/admin-guard";
import DataInicioClient from "./DataInicioClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: exige sessao de admin (login em /admin/login). O
// middleware ja redireciona quando nao ha cookie; aqui verificamos a
// assinatura completa no servidor antes de renderizar.
export default async function AdminDataInicioPage() {
  const { usuario } = await exigirAdmin("/admin/data-inicio");
  return <DataInicioClient usuario={usuario} />;
}
