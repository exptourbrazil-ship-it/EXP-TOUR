import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos } from "@/lib/catalog-disponibilidade";
import { t } from "@/lib/fornecedor-i18n";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";
import AcomodacaoClient from "@/components/AcomodacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disponibilidade (self-service da escola): programas (datas de inicio) e
// acomodacoes (periodos). Publica na hora. Escopado ao supplier da sessao.
export default async function DisponibilidadePage() {
  const sessao = await exigirFornecedor("/fornecedor/disponibilidade");
  const supabase = getServiceClient();
  const [programas, acomodacoes] = await Promise.all([
    listarProgramasComIntakes(supabase, sessao.supplierId),
    listarAcomodacoesComPeriodos(supabase, sessao.supplierId),
  ]);

  const T = t(sessao.language, {
    pt: {
      titulo: "Disponibilidade",
      descricao: "Cadastre seus programas (datas de início) e acomodações (períodos) com status e vagas. As alterações valem na hora.",
      programas: "Programas",
      acomodacoes: "Acomodações",
    },
    en: {
      titulo: "Availability",
      descricao: "Manage your programs (start dates) and accommodations (periods) with status and spots. Changes take effect immediately.",
      programas: "Programs",
      acomodacoes: "Accommodations",
    },
  });

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        {T.titulo}
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.descricao}
      </p>

      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 12px" }}>{T.programas}</h2>
      <DisponibilidadeClient endpoint="/api/fornecedor/disponibilidade" programas={programas} />

      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "28px 0 12px" }}>{T.acomodacoes}</h2>
      <AcomodacaoClient endpoint="/api/fornecedor/disponibilidade" acomodacoes={acomodacoes} />
    </div>
  );
}
