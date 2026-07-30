import { createClient } from "@supabase/supabase-js";
import Logo from "@/components/Logo";
import { converterParaBRL } from "@/lib/cambio";
import { estadoProposta } from "@/lib/propostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Página PÚBLICA da proposta (Cláusula 2.5.b): o contratante confere o programa,
// os valores na moeda e as Condições Gerais SEM compromisso, sem pagamento e
// sem reservar vaga/preço. Acesso pelo token do link (sem login). A assinatura
// eletrônica (que celebra o contrato) é a Fase C.

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtMoeda(valor: number, moeda: string): string {
  const c = (moeda || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(valor);
    } catch {
      /* fallback */
    }
  }
  return `${c || "?"} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream/40">
      <header className="bg-brand">
        <div className="mx-auto max-w-3xl px-5 py-4 md:px-8">
          <Logo escuro />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Moldura>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <h1 className="font-serif text-2xl text-brand">{titulo}</h1>
        <p className="mt-2 text-sm text-neutral-600">{texto}</p>
      </div>
    </Moldura>
  );
}

export default async function PropostaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const { data: p } = await supabase
    .from("propostas")
    .select("status, nome_completo, estudante_nome, programa_nome, pais_destino, moeda, custo_programa, data_inicio, validade")
    .eq("token", token)
    .maybeSingle();

  if (!p) {
    return <Aviso titulo="Proposta não encontrada" texto="Verifique o link recebido ou fale com a EXP Tour." />;
  }

  const estado = estadoProposta(p as any, hojeBrasilISO());
  if (estado === "expirada") {
    return <Aviso titulo="Proposta expirada" texto={`Esta proposta era válida até ${fmtData(p.validade)}. Fale com a EXP Tour para uma nova.`} />;
  }
  if (estado === "cancelada" || estado === "indisponivel") {
    return <Aviso titulo="Proposta indisponível" texto="Esta proposta não está mais disponível. Fale com a EXP Tour." />;
  }
  if (estado === "aceita") {
    return <Aviso titulo="Proposta já aceita" texto="Esta proposta já foi assinada. Acesse a sua Área do Cliente para acompanhar." />;
  }

  // estado === "valida" — carrega Condições Gerais vigentes e a simulação em R$.
  const { data: termo } = await supabase
    .from("termos")
    .select("versao, conteudo")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();

  let simulacaoBRL: number | null = null;
  if (p.moeda && p.custo_programa != null) {
    const { data: cot } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet")
      .eq("moeda", p.moeda)
      .lte("data", hojeBrasilISO())
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cot) simulacaoBRL = converterParaBRL(Number(p.custo_programa), Number(cot.cotacao_vet));
  }

  return (
    <Moldura>
      <div className="mb-4 rounded-2xl border border-brand/20 bg-brand-cream/60 p-4 text-sm text-brand">
        Esta é a sua proposta. Confira <strong>sem compromisso</strong> — nada é cobrado e nenhuma
        vaga é reservada nesta etapa.
      </div>

      <h1 className="font-serif text-3xl text-brand">Proposta EXP Tour</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {p.nome_completo ? `Para ${p.nome_completo}. ` : ""}Válida até {fmtData(p.validade)}.
      </p>

      {/* Programa */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand">Programa</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Linha rot="Programa" val={p.programa_nome} />
          <Linha rot="Estudante" val={p.estudante_nome} />
          <Linha rot="Destino" val={p.pais_destino} />
          <Linha rot="Início" val={fmtData(p.data_inicio)} />
        </dl>
      </section>

      {/* Valores */}
      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand">Valores</h2>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm text-neutral-600">Custo do programa (moeda de referência)</span>
          <span className="font-serif text-2xl text-brand">
            {p.custo_programa != null ? fmtMoeda(Number(p.custo_programa), p.moeda || "?") : "—"}
          </span>
        </div>
        {simulacaoBRL != null ? (
          <div className="mt-3 rounded-xl bg-brand-cream/50 p-3">
            <p className="text-xs text-neutral-600">
              Simulação informativa em Reais (cotação do dia): <strong>{fmtMoeda(simulacaoBRL, "BRL")}</strong>
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">
              Valor <strong>meramente informativo e não vinculante</strong>. A obrigação é na moeda de
              referência; o valor em Reais de cada pagamento só é definido pela cotação do dia no
              momento da liquidação e pode variar (câmbio).
            </p>
          </div>
        ) : null}
      </section>

      {/* Condições Gerais */}
      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand">
          Condições Gerais de Contratação{termo?.versao ? ` (versão ${termo.versao})` : ""}
        </h2>
        {termo?.conteudo ? (
          <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-700">
            {termo.conteudo}
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">As Condições Gerais serão anexadas a esta proposta.</p>
        )}
      </section>

      {/* Próximo passo (assinatura = Fase C) */}
      <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-5 text-center">
        <p className="text-sm text-neutral-600">
          Para prosseguir, a <strong>assinatura eletrônica</strong> será habilitada nesta tela.
          Enquanto isso, fale com a EXP Tour em caso de dúvida.
        </p>
      </div>
    </Moldura>
  );
}

function Linha({ rot, val }: { rot: string; val: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{rot}</dt>
      <dd className="text-brand">{val || "—"}</dd>
    </div>
  );
}
