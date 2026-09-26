import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarTabelasPorCargaHoraria } from "@/lib/fornecedor-precos-tabelas";
import { t as traduzir } from "@/lib/fornecedor-i18n";
import {
  tabelaViva,
  tabelaFutura,
  homogeneidade,
  identidadeDaTabela,
  nomeDerivado,
  gruposDeCarga,
  gruposDeFormato,
  cursosComFichaIncompleta,
  cursosSemTabela,
  cursosEmVariasTabelas,
  resumoFaixas,
  rotuloFaixa,
  formatarDinheiro,
  FORMATO_LABEL,
  type TabelaCargaHoraria,
} from "@/lib/preco-carga-horaria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tabelas por carga horaria (LEITURA). Inverte o objeto da tela: a tabela de
// preco no centro, os cursos como etiquetas penduradas nela — que e como a
// escola precifica de verdade (o nome do curso e marketing; o preco vem de
// quantas aulas por semana e de quantos alunos dividem o professor).
// Escopado ao supplier da sessao.

// Dicionario bilingue da tela. Construido uma vez por request a partir do
// idioma da sessao e repassado como prop aos componentes internos (server
// components, nao ha hook aqui).
function construirTextos(idioma: string | null | undefined) {
  return traduzir(idioma, {
    pt: {
      voltarPrecos: "← Preços",
      titulo: "Tabelas por carga horária",
      intro:
        "O que está publicado hoje, agrupado como você precifica: por aulas por semana e formato de aula. Cada tabela serve vários cursos. Confira e avise a EXP Tour se algo estiver errado — esta tela é só de leitura por enquanto.",
      nenhumCampus: "Nenhum campus cadastrado ainda.",
      semPrecoTitulo: (n: number) => (n === 1 ? "curso sem preço vigente" : "cursos sem preço vigente"),
      semPrecoSufixo: "— não podem ser cotados hoje:",
      duplicadosTitulo: "Curso em mais de uma tabela vigente no mesmo mercado",
      duplicadosSufixo: "— o preço cobrado fica ambíguo:",
      tabelaVigenteRotulo: (n: number) => (n === 1 ? "tabela vigente" : "tabelas vigentes"),
      aComecar: (n: number) => ` · ${n} a começar`,
      nenhumaTabelaCampus: "Nenhuma tabela de curso neste campus.",
      vigenciaPorComecar: (n: number) => `Vigência ainda por começar (${n})`,
      foraDeVigencia: (n: number) => `Fora de vigência (${n})`,
      unidadeLabel: (unit: string) =>
        unit === "week" ? "por semana" : unit === "day" ? "por noite" : unit === "month" ? "por mês" : `por ${unit}`,
      cursosCount: (n: number) => (n === 1 ? "curso" : "cursos"),
      semFim: "sem fim",
      soParaMercado: (nome: string | null) => (nome ? `Só para ${nome}` : "Só para um mercado"),
      geridaLabel: (gerida: boolean) => (gerida ? "Do seu price list" : "Cadastro EXP Tour"),
      misturaBadge: (cargas: number, formatos: number) =>
        cargas > 1 ? `${cargas} cargas horárias` : `${formatos} formatos`,
      arquivada: "Arquivada",
      rascunho: "Rascunho",
      expirada: "Expirada",
      vigenciaEncerrada: "Vigência encerrada",
      cadastradaComo: (nome: string) => `Cadastrada como “${nome}”. O título acima vem da ficha dos cursos.`,
      permanencia: "Permanência",
      precoUnidade: (unidade: string) => `Preço ${unidade}`,
      semFaixa: "Sem nenhuma faixa de preço — esta tabela não precifica nada.",
      cursosComEstePreco: "Cursos com este preço",
      misturaCargas: (n: number) => `${n} cargas horárias diferentes`,
      misturaFormatosTexto: "formatos de aula diferentes",
      misturaEPorFormatos: " e por formatos diferentes",
      misturaCobraMesmoPor: "Esta tabela cobra o mesmo por",
      aulasPorSemana: (valor: number) => `${valor} aulas por semana`,
      misturaAviso:
        "Pode ser proposital. Mas a mesma carga horária costuma custar várias vezes mais em aula individual — se estes cursos não deveriam custar o mesmo, avise a EXP Tour.",
      incompletosPrefixo: "Sem aulas por semana ou formato na ficha:",
      incompletosSufixo: "Sem isso não dá para conferir se estão na tabela certa. Você preenche em",
      conteudoLink: "Conteúdo",
    },
    en: {
      voltarPrecos: "← Pricing",
      titulo: "Tables by weekly hours",
      intro:
        "What's published today, grouped the way you actually price: by lessons per week and lesson format. Each table serves several courses. Review it and let EXP Tour know if something looks wrong — this screen is read-only for now.",
      nenhumCampus: "No campus registered yet.",
      semPrecoTitulo: (n: number) => (n === 1 ? "course with no active price" : "courses with no active price"),
      semPrecoSufixo: "— cannot be quoted today:",
      duplicadosTitulo: "Course in more than one active table for the same market",
      duplicadosSufixo: "— the price charged is ambiguous:",
      tabelaVigenteRotulo: (n: number) => (n === 1 ? "active table" : "active tables"),
      aComecar: (n: number) => ` · ${n} upcoming`,
      nenhumaTabelaCampus: "No course table for this campus.",
      vigenciaPorComecar: (n: number) => `Upcoming (${n})`,
      foraDeVigencia: (n: number) => `No longer active (${n})`,
      unidadeLabel: (unit: string) =>
        unit === "week" ? "per week" : unit === "day" ? "per night" : unit === "month" ? "per month" : `per ${unit}`,
      cursosCount: (n: number) => (n === 1 ? "course" : "courses"),
      semFim: "no end date",
      soParaMercado: (nome: string | null) => (nome ? `Only for ${nome}` : "Only for one market"),
      geridaLabel: (gerida: boolean) => (gerida ? "From your price list" : "Registered by EXP Tour"),
      misturaBadge: (cargas: number, formatos: number) =>
        cargas > 1 ? `${cargas} weekly-hour tiers` : `${formatos} formats`,
      arquivada: "Archived",
      rascunho: "Draft",
      expirada: "Expired",
      vigenciaEncerrada: "No longer active",
      cadastradaComo: (nome: string) => `Registered as “${nome}”. The title above comes from the courses' record.`,
      permanencia: "Length of stay",
      precoUnidade: (unidade: string) => `Price ${unidade}`,
      semFaixa: "No price tier at all — this table doesn't price anything.",
      cursosComEstePreco: "Courses with this price",
      misturaCargas: (n: number) => `${n} different weekly-hour loads`,
      misturaFormatosTexto: "different lesson formats",
      misturaEPorFormatos: " and by different formats",
      misturaCobraMesmoPor: "This table charges the same for",
      aulasPorSemana: (valor: number) => `${valor} lessons per week`,
      misturaAviso:
        "This may be intentional. But the same weekly hours often cost several times more in individual lessons — if these courses shouldn't cost the same, let EXP Tour know.",
      incompletosPrefixo: "Missing lessons per week or format in the record:",
      incompletosSufixo: "Without it there's no way to check they're in the right table. You fill it in under",
      conteudoLink: "Content",
    },
  });
}

type Textos = ReturnType<typeof construirTextos>;

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

function Selo({ texto, cor, fundo }: { texto: string; cor: string; fundo: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: cor,
        background: fundo,
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}

function Aviso({ tom, children }: { tom: "atencao" | "erro"; children: React.ReactNode }) {
  const cor = tom === "erro" ? "#b91c1c" : "#92400e";
  const fundo = tom === "erro" ? "#fef2f2" : "#fffbeb";
  const borda = tom === "erro" ? "#fecaca" : "#fde68a";
  return (
    <div
      style={{
        border: `1px solid ${borda}`,
        background: fundo,
        color: cor,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.5,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// Situacao de uma tabela que nao esta viva hoje. O enum de status e
// draft | active | expired — tratar todos, senao a escola ve "Rascunho" numa
// tabela que na verdade venceu.
function rotuloSituacao(tabela: TabelaCargaHoraria, T: Textos): string {
  if (tabela.archivedAt) return T.arquivada;
  if (tabela.status === "draft") return T.rascunho;
  if (tabela.status === "expired") return T.expirada;
  return T.vigenciaEncerrada;
}

function CartaoTabela({ t: tabela, viva, T }: { t: TabelaCargaHoraria; viva: boolean; T: Textos }) {
  const id = identidadeDaTabela(tabela);
  const derivado = nomeDerivado(id);
  const homog = homogeneidade(tabela);
  const mistura = homog.cargas > 1 || homog.formatos > 1;
  const incompletos = cursosComFichaIncompleta(tabela);
  const unidade = T.unidadeLabel(tabela.unit);

  return (
    <details
      style={{
        border: "1px solid var(--p-line)",
        borderRadius: 12,
        background: "#fff",
        marginBottom: 10,
        opacity: viva ? 1 : 0.72,
      }}
    >
      <summary style={{ padding: "12px 14px", cursor: "pointer", listStyle: "none" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16 }}>
            {derivado ?? tabela.nomeCadastrado}
          </strong>
          <span style={{ color: "var(--p-muted)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {resumoFaixas(tabela.faixas, tabela.currency)} {unidade}
          </span>
          <span style={{ color: "var(--p-muted)", fontSize: 13 }}>
            · {tabela.cursos.length} {T.cursosCount(tabela.cursos.length)}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Selo texto={`${tabela.currency} · ${unidade}`} cor="var(--p-ink)" fundo="var(--p-soft, #f1f5f9)" />
          <Selo
            texto={`${dataBR(tabela.validFrom)} → ${tabela.validUntil ? dataBR(tabela.validUntil) : T.semFim}`}
            cor={viva ? "var(--p-success-ink, #166534)" : "#b45309"}
            fundo={viva ? "#ecfdf5" : "#fffbeb"}
          />
          {!viva && <Selo texto={rotuloSituacao(tabela, T)} cor="#b45309" fundo="#fffbeb" />}
          {tabela.marketId && (
            <Selo
              texto={T.soParaMercado(tabela.marketNome ?? null)}
              cor="var(--p-ink)"
              fundo="var(--p-soft, #f1f5f9)"
            />
          )}
          <Selo texto={T.geridaLabel(tabela.gerida)} cor="var(--p-muted)" fundo="var(--p-soft, #f1f5f9)" />
          {mistura && (
            <Selo
              texto={T.misturaBadge(homog.cargas, homog.formatos)}
              cor="#92400e"
              fundo="#fffbeb"
            />
          )}
        </div>
      </summary>

      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--p-line)", marginTop: 4, paddingTop: 12 }}>
        {derivado && derivado !== tabela.nomeCadastrado && (
          <p style={{ color: "var(--p-muted)", fontSize: 12, margin: "0 0 12px" }}>
            {T.cadastradaComo(tabela.nomeCadastrado)}
          </p>
        )}

        {/* Faixas de permanência */}
        <table style={{ borderCollapse: "collapse", fontSize: 14, marginBottom: 14, minWidth: 260 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
              <th style={{ padding: "4px 16px 4px 0", fontWeight: 600 }}>{T.permanencia}</th>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>{T.precoUnidade(unidade)}</th>
            </tr>
          </thead>
          <tbody>
            {tabela.faixas.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: "6px 0", color: "#b91c1c" }}>
                  {T.semFaixa}
                </td>
              </tr>
            ) : (
              tabela.faixas.map((f, i) => (
                <tr key={f.minQuantity} style={{ color: "var(--p-ink)" }}>
                  <td style={{ padding: "4px 16px 4px 0" }}>{rotuloFaixa(tabela.faixas, i, tabela.unit)}</td>
                  <td style={{ padding: "4px 0", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {formatarDinheiro(f.unitPrice, tabela.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Cursos etiquetados */}
        <div style={{ color: "var(--p-muted)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          {T.cursosComEstePreco}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: mistura || incompletos.length ? 14 : 0 }}>
          {tabela.cursos.map((c) => (
            <span
              key={c.id}
              style={{
                border: "1px solid var(--p-line)",
                background: "var(--p-soft, #f8fafc)",
                color: "var(--p-ink)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 13,
              }}
            >
              {c.nome}
            </span>
          ))}
        </div>

        {/* Mistura de cargas/formatos: mostramos os GRUPOS, sem eleger um certo
            e um errado. Com dois cursos de cargas diferentes nao ha maioria —
            acusar a minoria tratava o mesmo fenomeno de dois jeitos opostos. */}
        {mistura && (
          <Aviso tom="atencao">
            <strong>
              {T.misturaCobraMesmoPor}{" "}
              {homog.cargas > 1 ? T.misturaCargas(homog.cargas) : T.misturaFormatosTexto}
              {homog.cargas > 1 && homog.formatos > 1 ? T.misturaEPorFormatos : ""}.
            </strong>
            {homog.cargas > 1 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {gruposDeCarga(tabela).map((g) => (
                  <li key={g.valor}>
                    <strong>{T.aulasPorSemana(g.valor)}</strong>: {g.cursos.map((c) => c.nome).join(", ")}
                  </li>
                ))}
              </ul>
            )}
            {homog.formatos > 1 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {gruposDeFormato(tabela).map((g) => (
                  <li key={g.valor}>
                    <strong>{FORMATO_LABEL[g.valor]}</strong>: {g.cursos.map((c) => c.nome).join(", ")}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ margin: "6px 0 0" }}>{T.misturaAviso}</p>
          </Aviso>
        )}

        {incompletos.length > 0 && (
          <Aviso tom="atencao">
            {T.incompletosPrefixo}{" "}
            <strong>{incompletos.map((c) => c.nome).join(", ")}</strong>. {T.incompletosSufixo}{" "}
            <Link href="/fornecedor/conteudo" style={{ color: "inherit" }}>
              {T.conteudoLink}
            </Link>
            .
          </Aviso>
        )}
      </div>
    </details>
  );
}

export default async function TabelasPorCargaHorariaPage() {
  const sessao = await exigirFornecedor("/fornecedor/precos/tabelas");
  const supabase = getServiceClient();
  const { campi, todasTabelas, todosCursos } = await listarTabelasPorCargaHoraria(
    supabase,
    sessao.supplierId,
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const T = construirTextos(sessao.language);

  // Os dois alertas valem para o fornecedor INTEIRO: uma tabela pode etiquetar
  // curso de outro campus do mesmo grupo, e por campus isso viraria alarme falso.
  const semPreco = cursosSemTabela(todosCursos, todasTabelas, hoje);
  const duplicados = cursosEmVariasTabelas(todasTabelas, hoje);
  // `cursosEmVariasTabelas` trabalha sobre as etiquetas das tabelas, que nao
  // carregam campus; o nome da unidade vem do catalogo do fornecedor.
  const campusDoCurso = new Map(todosCursos.map((c) => [c.id, c.campusNome ?? null]));

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <Link href="/fornecedor/precos" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          {T.voltarPrecos}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        {T.titulo}
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px", maxWidth: "65ch" }}>
        {T.intro}
      </p>

      {campi.length === 0 && (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumCampus}</p>
      )}

      {semPreco.length > 0 && (
        <Aviso tom="erro">
          <strong>
            {semPreco.length} {T.semPrecoTitulo(semPreco.length)}
          </strong>{" "}
          {T.semPrecoSufixo}{" "}
          {semPreco.map((c) => (c.campusNome ? `${c.nome} (${c.campusNome})` : c.nome)).join(", ")}.
        </Aviso>
      )}

      {duplicados.length > 0 && (
        <Aviso tom="erro">
          <strong>{T.duplicadosTitulo}</strong> {T.duplicadosSufixo}{" "}
          {duplicados
            .map((d) => {
              const campus = campusDoCurso.get(d.curso.id);
              return campus ? `${d.curso.nome} (${campus})` : d.curso.nome;
            })
            .join(", ")}.
        </Aviso>
      )}

      {campi.map((campus) => {
        const vigentes = campus.tabelas.filter((t) => tabelaViva(t, hoje));
        const futuras = campus.tabelas.filter((t) => tabelaFutura(t, hoje));
        const encerradas = campus.tabelas.filter((t) => !tabelaViva(t, hoje) && !tabelaFutura(t, hoje));

        return (
          <section key={campus.campusId} style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 4px" }}>
              {campus.campusNome}
            </h2>
            <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 14px" }}>
              {vigentes.length} {T.tabelaVigenteRotulo(vigentes.length)}
              {futuras.length > 0 && T.aComecar(futuras.length)}
            </p>

            {campus.tabelas.length === 0 ? (
              <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumaTabelaCampus}</p>
            ) : (
              <>
                {vigentes.map((t) => (
                  <CartaoTabela key={t.id} t={t} viva T={T} />
                ))}

                {futuras.length > 0 && (
                  <>
                    <h3 style={{ fontFamily: "var(--p-heading)", color: "var(--p-muted)", fontSize: 14, margin: "20px 0 10px" }}>
                      {T.vigenciaPorComecar(futuras.length)}
                    </h3>
                    {futuras.map((t) => (
                      <CartaoTabela key={t.id} t={t} viva={false} T={T} />
                    ))}
                  </>
                )}

                {encerradas.length > 0 && (
                  <>
                    <h3 style={{ fontFamily: "var(--p-heading)", color: "var(--p-muted)", fontSize: 14, margin: "20px 0 10px" }}>
                      {T.foraDeVigencia(encerradas.length)}
                    </h3>
                    {encerradas.map((t) => (
                      <CartaoTabela key={t.id} t={t} viva={false} T={T} />
                    ))}
                  </>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
