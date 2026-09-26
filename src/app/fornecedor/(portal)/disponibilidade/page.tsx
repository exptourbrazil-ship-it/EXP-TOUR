import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos } from "@/lib/catalog-disponibilidade";
import { t } from "@/lib/fornecedor-i18n";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";
import AcomodacaoClient from "@/components/AcomodacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disponibilidade (self-service da escola): datas de início dos cursos e
// períodos das acomodações JÁ EXISTENTES (ativos). A criação de curso/
// acomodação mora nas abas "Cursos"/"Acomodações" (rascunho oculto até a EXP
// Tour aprovar o conteúdo — ver NovoCursoForm/NovaAcomodacaoForm). Publica na
// hora. Escopado ao supplier da sessao.
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
      descricao:
        "Datas de início dos seus cursos e períodos das suas acomodações, com status e vagas. As alterações valem na hora. Para cadastrar um novo curso ou uma nova acomodação, acesse as abas Cursos / Acomodações.",
      programas: "Programas",
      acomodacoes: "Acomodações",
    },
    en: {
      titulo: "Availability",
      descricao:
        "Start dates for your courses and periods for your accommodations, with status and spots. Changes take effect immediately. To register a new course or accommodation, use the Courses / Accommodation tabs.",
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
      <DisponibilidadeClient endpoint="/api/fornecedor/disponibilidade" programas={programas} permitirCriar={false} />

      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "28px 0 12px" }}>{T.acomodacoes}</h2>
      <AcomodacaoClient endpoint="/api/fornecedor/disponibilidade" acomodacoes={acomodacoes} permitirCriar={false} />
    </div>
  );
}
