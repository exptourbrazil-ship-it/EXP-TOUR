import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarDocumentoIntegral } from "@/lib/documento-integral-service";
import { montarDocumentoIntegral, type Bloco } from "@/lib/documento-integral";
import ImprimirBotao from "./ImprimirBotao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Via Integral do contrato (Clausula 17.3 / Dec. 7.962): documento arquivavel e
// imprimivel com Condicoes Gerais + Quadro Resumo (snapshot do aceite) + Anexos
// + prova do aceite. Escopado por POSSE (o contrato tem de ser do titular
// autenticado); contrato de outro cliente -> 404.

function BlocoTabela({ bloco }: { bloco: Bloco }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-brand">{bloco.titulo}</h3>
      <dl className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {bloco.linhas.map((l, i) => (
          <div key={i} className="flex justify-between gap-4 px-3 py-1.5 text-sm">
            <dt className="text-neutral-600">{l.rotulo}</dt>
            <dd className="text-right font-medium text-neutral-900">{l.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-before-auto">
      <h2 className="mb-3 border-b-2 border-brand/30 pb-1 font-serif text-2xl text-brand">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function ContratoIntegralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) redirect("/");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const input = await carregarDocumentoIntegral(supabase, sessao.titularId, id);
  if (!input) notFound();

  const doc = montarDocumentoIntegral(input);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-3xl px-4 print:max-w-none print:px-0">
        {/* Barra de acoes (fora da impressao) */}
        <div className="mb-5 flex items-center justify-between print:hidden">
          <Link href="/documentos" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Voltar aos documentos
          </Link>
          <ImprimirBotao />
        </div>

        <article className="rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
          {/* Cabecalho */}
          <header className="border-b border-neutral-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">EXP Tour</p>
            <h1 className="mt-1 font-serif text-3xl text-brand">{doc.titulo}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Referência: <span className="font-medium text-neutral-900">{doc.referencia}</span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">Emitida em {doc.geradoEm}</p>
          </header>

          {/* Avisos */}
          {doc.avisos.length > 0 && (
            <div className="mt-4 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3 text-sm text-neutral-700">
              <ul className="list-inside list-disc space-y-0.5">
                {doc.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Quadro Resumo */}
          {doc.quadroResumo.presente && (
            <Secao titulo="Quadro Resumo">
              {doc.quadroResumo.blocos.map((b, i) => (
                <BlocoTabela key={i} bloco={b} />
              ))}
            </Secao>
          )}

          {/* Condicoes Gerais */}
          {doc.condicoesGerais.presente && (
            <Secao titulo="Condições Gerais">
              <p className="mb-2 text-xs text-neutral-500">
                Versão {doc.condicoesGerais.versao} · impressão digital {doc.condicoesGerais.hash?.slice(0, 16)}…
              </p>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                {doc.condicoesGerais.conteudo}
              </div>
            </Secao>
          )}

          {/* Anexo II */}
          <Secao titulo="Anexo II — Metodologia de câmbio">
            <div className="mb-3 rounded-lg bg-neutral-50 p-3 text-center font-mono text-sm text-neutral-800">
              {doc.anexoII.formula}
            </div>
            <BlocoTabela bloco={{ titulo: "Componentes", linhas: doc.anexoII.componentes }} />
            <p className="text-sm text-neutral-600">{doc.anexoII.nota}</p>
          </Secao>

          {/* Anexo III */}
          {doc.anexoIII.presente && (
            <Secao titulo="Anexo III — Política de Pagamento dos Fornecedores">
              {doc.anexoIII.itens.map((b, i) => (
                <BlocoTabela key={i} bloco={b} />
              ))}
            </Secao>
          )}

          {/* Prova do aceite */}
          {doc.aceite.presente && (
            <Secao titulo="Prova de aceite (assinatura eletrônica)">
              <BlocoTabela bloco={{ titulo: "Registro do aceite", linhas: doc.aceite.linhas }} />
              <p className="text-xs text-neutral-500">
                Este documento reúne, em via integral e permanente (art. 17.3 do contrato; Dec. 7.962/2013), as
                Condições Gerais, o Quadro Resumo e os Anexos vigentes no aceite, com o registro da marcação
                eletrônica. Disponível para consulta, download e impressão na Área do Cliente. O registro do aceite
                comprova o consentimento à versão indicada das Condições Gerais; o identificador de sessão refere-se
                ao ato de marcação desta contratação.
              </p>
            </Secao>
          )}
        </article>
      </div>
    </div>
  );
}
