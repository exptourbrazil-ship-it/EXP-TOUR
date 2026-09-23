import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarTabelasPorCargaHoraria } from "@/lib/fornecedor-precos-tabelas";
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
function rotuloSituacao(t: TabelaCargaHoraria): string {
  if (t.archivedAt) return "Arquivada";
  if (t.status === "draft") return "Rascunho";
  if (t.status === "expired") return "Expirada";
  return "Vigência encerrada";
}

function CartaoTabela({ t, viva }: { t: TabelaCargaHoraria; viva: boolean }) {
  const id = identidadeDaTabela(t);
  const derivado = nomeDerivado(id);
  const homog = homogeneidade(t);
  const mistura = homog.cargas > 1 || homog.formatos > 1;
  const incompletos = cursosComFichaIncompleta(t);
  const unidade = t.unit === "week" ? "por semana" : t.unit === "day" ? "por noite" : t.unit === "month" ? "por mês" : `por ${t.unit}`;

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
            {derivado ?? t.nomeCadastrado}
          </strong>
          <span style={{ color: "var(--p-muted)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {resumoFaixas(t.faixas, t.currency)} {unidade}
          </span>
          <span style={{ color: "var(--p-muted)", fontSize: 13 }}>
            · {t.cursos.length} {t.cursos.length === 1 ? "curso" : "cursos"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Selo texto={`${t.currency} · ${unidade}`} cor="var(--p-ink)" fundo="var(--p-soft, #f1f5f9)" />
          <Selo
            texto={`${dataBR(t.validFrom)} → ${t.validUntil ? dataBR(t.validUntil) : "sem fim"}`}
            cor={viva ? "var(--p-success-ink, #166534)" : "#b45309"}
            fundo={viva ? "#ecfdf5" : "#fffbeb"}
          />
          {!viva && <Selo texto={rotuloSituacao(t)} cor="#b45309" fundo="#fffbeb" />}
          {t.marketId && (
            <Selo
              texto={t.marketNome ? `Só para ${t.marketNome}` : "Só para um mercado"}
              cor="var(--p-ink)"
              fundo="var(--p-soft, #f1f5f9)"
            />
          )}
          <Selo texto={t.gerida ? "Do seu price list" : "Cadastro EXP Tour"} cor="var(--p-muted)" fundo="var(--p-soft, #f1f5f9)" />
          {mistura && (
            <Selo
              texto={homog.cargas > 1 ? `${homog.cargas} cargas horárias` : `${homog.formatos} formatos`}
              cor="#92400e"
              fundo="#fffbeb"
            />
          )}
        </div>
      </summary>

      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--p-line)", marginTop: 4, paddingTop: 12 }}>
        {derivado && derivado !== t.nomeCadastrado && (
          <p style={{ color: "var(--p-muted)", fontSize: 12, margin: "0 0 12px" }}>
            Cadastrada como “{t.nomeCadastrado}”. O título acima vem da ficha dos cursos.
          </p>
        )}

        {/* Faixas de permanência */}
        <table style={{ borderCollapse: "collapse", fontSize: 14, marginBottom: 14, minWidth: 260 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
              <th style={{ padding: "4px 16px 4px 0", fontWeight: 600 }}>Permanência</th>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Preço {unidade}</th>
            </tr>
          </thead>
          <tbody>
            {t.faixas.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: "6px 0", color: "#b91c1c" }}>
                  Sem nenhuma faixa de preço — esta tabela não precifica nada.
                </td>
              </tr>
            ) : (
              t.faixas.map((f, i) => (
                <tr key={f.minQuantity} style={{ color: "var(--p-ink)" }}>
                  <td style={{ padding: "4px 16px 4px 0" }}>{rotuloFaixa(t.faixas, i, t.unit)}</td>
                  <td style={{ padding: "4px 0", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {formatarDinheiro(f.unitPrice, t.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Cursos etiquetados */}
        <div style={{ color: "var(--p-muted)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          Cursos com este preço
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: mistura || incompletos.length ? 14 : 0 }}>
          {t.cursos.map((c) => (
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
              Esta tabela cobra o mesmo por{" "}
              {homog.cargas > 1 ? `${homog.cargas} cargas horárias diferentes` : "formatos de aula diferentes"}
              {homog.cargas > 1 && homog.formatos > 1 ? " e por formatos diferentes" : ""}.
            </strong>
            {homog.cargas > 1 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {gruposDeCarga(t).map((g) => (
                  <li key={g.valor}>
                    <strong>{g.valor} aulas por semana</strong>: {g.cursos.map((c) => c.nome).join(", ")}
                  </li>
                ))}
              </ul>
            )}
            {homog.formatos > 1 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {gruposDeFormato(t).map((g) => (
                  <li key={g.valor}>
                    <strong>{FORMATO_LABEL[g.valor]}</strong>: {g.cursos.map((c) => c.nome).join(", ")}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ margin: "6px 0 0" }}>
              Pode ser proposital. Mas a mesma carga horária costuma custar várias vezes mais em aula
              individual — se estes cursos não deveriam custar o mesmo, avise a EXP Tour.
            </p>
          </Aviso>
        )}

        {incompletos.length > 0 && (
          <Aviso tom="atencao">
            Sem aulas por semana ou formato na ficha:{" "}
            <strong>{incompletos.map((c) => c.nome).join(", ")}</strong>. Sem isso não dá para conferir
            se estão na tabela certa. Você preenche em{" "}
            <Link href="/fornecedor/conteudo" style={{ color: "inherit" }}>
              Conteúdo
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
          ← Preços
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        Tabelas por carga horária
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px", maxWidth: "65ch" }}>
        O que está publicado hoje, agrupado como você precifica: por aulas por semana e formato de aula.
        Cada tabela serve vários cursos. Confira e avise a EXP Tour se algo estiver errado — esta tela é
        só de leitura por enquanto.
      </p>

      {campi.length === 0 && (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>Nenhum campus cadastrado ainda.</p>
      )}

      {semPreco.length > 0 && (
        <Aviso tom="erro">
          <strong>
            {semPreco.length} {semPreco.length === 1 ? "curso sem preço vigente" : "cursos sem preço vigente"}
          </strong>{" "}
          — não podem ser cotados hoje:{" "}
          {semPreco.map((c) => (c.campusNome ? `${c.nome} (${c.campusNome})` : c.nome)).join(", ")}.
        </Aviso>
      )}

      {duplicados.length > 0 && (
        <Aviso tom="erro">
          <strong>Curso em mais de uma tabela vigente no mesmo mercado</strong> — o preço cobrado fica
          ambíguo:{" "}
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
              {vigentes.length} {vigentes.length === 1 ? "tabela vigente" : "tabelas vigentes"}
              {futuras.length > 0 && ` · ${futuras.length} a começar`}
            </p>

            {campus.tabelas.length === 0 ? (
              <p style={{ color: "var(--p-muted)", fontSize: 14 }}>Nenhuma tabela de curso neste campus.</p>
            ) : (
              <>
                {vigentes.map((t) => (
                  <CartaoTabela key={t.id} t={t} viva />
                ))}

                {futuras.length > 0 && (
                  <>
                    <h3 style={{ fontFamily: "var(--p-heading)", color: "var(--p-muted)", fontSize: 14, margin: "20px 0 10px" }}>
                      Vigência ainda por começar ({futuras.length})
                    </h3>
                    {futuras.map((t) => (
                      <CartaoTabela key={t.id} t={t} viva={false} />
                    ))}
                  </>
                )}

                {encerradas.length > 0 && (
                  <>
                    <h3 style={{ fontFamily: "var(--p-heading)", color: "var(--p-muted)", fontSize: 14, margin: "20px 0 10px" }}>
                      Fora de vigência ({encerradas.length})
                    </h3>
                    {encerradas.map((t) => (
                      <CartaoTabela key={t.id} t={t} viva={false} />
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
