"use client";
import { useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, labelDoTipoDocumento, categoriaDoTipoDocumento } from "@/lib/documentos";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Reenviar",
};

// Cor do badge por status, em classes utilitarias (nunca vermelho na Area do
// Cliente): ambar = em analise, verde = aprovado, laranja = reenviar.
const STATUS_CLASSE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800",
  aprovado: "bg-emerald-100 text-emerald-700",
  rejeitado: "bg-orange-100 text-orange-800",
};

// Passo a passo para solicitar o passaporte brasileiro (Policia Federal).
// Valores e detalhes mudam com o tempo -> sempre apontamos para o site oficial.
const PASSOS_PASSAPORTE = [
  "Acesse o site da Polícia Federal (gov.br/pf) e preencha o formulário de solicitação de passaporte.",
  "Emita e pague a GRU (taxa federal) gerada no próprio site.",
  "Agende o atendimento presencial na unidade da PF mais próxima.",
  "No dia, leve documento de identidade original, o comprovante de pagamento da GRU e o protocolo do agendamento.",
  "No atendimento são coletados foto, impressões digitais e assinatura.",
  "Acompanhe a emissão pelo site e retire o passaporte na unidade quando estiver pronto.",
];

// Icone por status (herda a cor do badge via currentColor). Estado nunca so por
// cor: sempre icone + cor + texto (relogio = em analise, check = aprovado,
// alerta = reenviar).
function IconeStatus({ chave }: { chave: string }) {
  const props = { className: "h-3 w-3 shrink-0", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (chave === "aprovado") {
    return (
      <svg {...props}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (chave === "rejeitado") {
    return (
      <svg {...props}>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const chave = status || "pendente";
  const label = STATUS_LABEL[chave] || STATUS_LABEL.pendente;
  const classe = STATUS_CLASSE[chave] || STATUS_CLASSE.pendente;
  return (
    <span className={"inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + classe}>
      <IconeStatus chave={chave} />
      {label}
    </span>
  );
}

// Icone de documento (SVG inline) usado em cada linha, no estilo do mockup.
function IconeArquivo() {
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-brand-cream">
      <svg className="h-[18px] w-[18px] text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

// Icones pequenos dos botoes de acao; herdam a cor do botao (currentColor).
function IconeAcao({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-[15px] w-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const IconeBaixar = () => (
  <IconeAcao>
    <path d="M12 3v11" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 21h14" />
  </IconeAcao>
);
const IconeReenviar = () => (
  <IconeAcao>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </IconeAcao>
);
const IconeLixeira = () => (
  <IconeAcao>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
  </IconeAcao>
);

// Base dos botoes de acao com alvo de toque confortavel (>=44px de altura).
const ACAO_BASE = "inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold";

export default function DocumentosClient({ documentos, afiliadoVistoUrl }: { documentos: any[]; afiliadoVistoUrl?: string | null }) {
  const [documentosState, setDocumentosState] = useState(documentos || []);
  const [tipoUpload, setTipoUpload] = useState({} as Record<string, string>);
  const [enviando, setEnviando] = useState(null as string | null);
  const [excluindo, setExcluindo] = useState(null as string | null);
  const [mensagem, setMensagem] = useState({} as Record<string, string>);
  const [mostrarPassaporte, setMostrarPassaporte] = useState(false);

  const secoes = CATEGORIAS_DOCUMENTO.map((cat) => {
    const tipos = TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor);
    const grupos = tipos
      .map((tipo) => ({ tipo: tipo.valor, itens: documentosState.filter((d) => d.tipo_documento === tipo.valor) }))
      .filter((g) => g.itens.length > 0);
    return { ...cat, tipos, grupos };
  });

  // Cliente só envia documentos do estudante. Escola/financeiro são inseridos pelo admin.
  function podeEnviar(categoria: string) {
    return categoria === "estudante";
  }

  async function enviarArquivo(categoria: string, tipos: any[], e: any) {
    const arquivo: File | null = e.target.files?.[0] || null;
    e.target.value = "";
    if (!arquivo) return;
    const tipoDocumento = tipoUpload[categoria] || tipos[0]?.valor;
    if (!tipoDocumento) return;

    setEnviando(categoria);
    setMensagem((m) => ({ ...m, [categoria]: "" }));
    try {
      const formData = new FormData();
      formData.append("tipoDocumento", tipoDocumento);
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setMensagem((m) => ({ ...m, [categoria]: `Erro: ${json.error || "falha ao enviar"}` }));
      } else {
        setDocumentosState((ds) => [...ds, json.documento]);
        setMensagem((m) => ({ ...m, [categoria]: "Documento enviado com sucesso." }));
      }
    } catch (err: any) {
      setMensagem((m) => ({ ...m, [categoria]: `Erro: ${err.message}` }));
    } finally {
      setEnviando(null);
    }
  }

  // Exclui um documento do estudante enviado pelo proprio cliente. Pede
  // confirmacao e remove da lista ao concluir. A regra de seguranca tambem e
  // aplicada no servidor (so categoria "estudante" + origem "titular").
  async function excluirDocumento(doc: any) {
    const ok = window.confirm(
      `Excluir "${labelDoTipoDocumento(doc.tipo_documento)}" (${doc.nome_arquivo})? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setExcluindo(doc.id);
    setMensagem((m) => ({ ...m, estudante: "" }));
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMensagem((m) => ({ ...m, estudante: json.erro || "Não foi possível excluir o documento." }));
      } else {
        setDocumentosState((ds) => ds.filter((d) => d.id !== doc.id));
        setMensagem((m) => ({ ...m, estudante: "Documento excluído." }));
      }
    } catch {
      setMensagem((m) => ({ ...m, estudante: "Não foi possível excluir o documento." }));
    } finally {
      setExcluindo(null);
    }
  }

  // Reenvio inline de um documento rejeitado: pre-seleciona o tipo na caixa de
  // envio da mesma categoria e rola ate ela, para o cliente nao precisar caçar
  // o campo nem adivinhar o que escolher.
  function reenviarDocumento(doc: any) {
    const categoria = categoriaDoTipoDocumento(doc.tipo_documento);
    setTipoUpload((t) => ({ ...t, [categoria]: doc.tipo_documento }));
    const alvo = typeof document !== "undefined" ? document.getElementById(`upload-${categoria}`) : null;
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function linhaDocumento(doc: any) {
    const categoria = categoriaDoTipoDocumento(doc.tipo_documento);
    // Cliente pode excluir apenas documentos do ESTUDANTE que ele proprio
    // enviou (origem "titular"). Documentos da escola/financeiro ficam protegidos.
    const podeExcluir = categoria === "estudante" && doc.origem === "titular";
    // Reenvio so faz sentido para documentos do estudante (unica categoria que
    // o cliente envia) que o admin marcou como rejeitados.
    const podeReenviar = categoria === "estudante" && doc.status === "rejeitado";

    return (
      <div key={doc.id} className="border-t border-neutral-200 py-3.5">
        {/* Linha 1: icone + nome/arquivo + status */}
        <div className="flex items-center gap-3">
          <IconeArquivo />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-900">{labelDoTipoDocumento(doc.tipo_documento)}</div>
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-500">{doc.nome_arquivo}</div>
          </div>
          <StatusBadge status={doc.status} />
        </div>

        {/* Motivo da rejeicao, quando houver: diz ao cliente O QUE corrigir. */}
        {doc.status === "rejeitado" && doc.motivo_rejeicao ? (
          <p className="mt-2.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2 text-[12.5px] leading-snug text-orange-800">
            <span className="font-bold">Motivo: </span>
            {doc.motivo_rejeicao}
          </p>
        ) : null}

        {/* Linha 2: acoes com alvo de toque adequado, destrutivo separado e neutro. */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <a
            href={`/api/documentos/${doc.id}/download`}
            target="_blank"
            rel="noreferrer"
            className={ACAO_BASE + " border-neutral-300 bg-white text-brand-golddark"}
          >
            <IconeBaixar />
            Baixar
          </a>
          {podeReenviar ? (
            <button
              onClick={() => reenviarDocumento(doc)}
              className={ACAO_BASE + " border-orange-200 bg-orange-50 text-orange-800"}
            >
              <IconeReenviar />
              Reenviar
            </button>
          ) : null}
          {podeExcluir ? (
            <button
              onClick={() => excluirDocumento(doc)}
              disabled={excluindo === doc.id}
              className={ACAO_BASE + " border-neutral-300 bg-white text-neutral-500 disabled:opacity-50"}
            >
              <IconeLixeira />
              {excluindo === doc.id ? "Excluindo..." : "Excluir"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function caixaUpload(secao: any) {
    return (
      <div id={`upload-${secao.valor}`} className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3.5">
        <div className="mb-2.5 text-[13px] font-semibold text-brand">Enviar novo documento</div>
        <select
          value={tipoUpload[secao.valor] || secao.tipos[0]?.valor}
          onChange={(e) => setTipoUpload((t) => ({ ...t, [secao.valor]: e.target.value }))}
          className="mb-2.5 block w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-[13px]"
        >
          {secao.tipos.map((t: any) => (
            <option key={t.valor} value={t.valor}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept="image/*,application/pdf"
          disabled={enviando === secao.valor}
          onChange={(e) => enviarArquivo(secao.valor, secao.tipos, e)}
          className="block w-full text-[13px]"
        />
        <p className="mt-1.5 text-[11.5px] text-neutral-500">Formatos aceitos: PDF, JPG ou PNG.</p>
        {enviando === secao.valor ? <p className="mt-2 text-xs text-neutral-500">Enviando...</p> : null}
        {mensagem[secao.valor] ? <p className="mt-2 text-xs text-brand">{mensagem[secao.valor]}</p> : null}
      </div>
    );
  }

  function cardSecao(secao: any) {
    const vazia = secao.grupos.length === 0;
    const subtitulo =
      secao.valor === "estudante"
        ? "Documentos que você envia para a EXP Tour"
        : secao.valor === "escola"
        ? "Documentos emitidos pela escola ou pela EXP Tour"
        : "Documentos financeiros do seu programa";
    return (
      <div key={secao.valor} className="mb-4 rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-xl text-brand">{secao.label}</h2>
        <p className="mt-1 mb-1 text-xs text-neutral-400">{subtitulo}</p>
        {vazia ? (
          <p className="pb-1 pt-4 text-[13px] text-neutral-500">
            {secao.valor === "estudante"
              ? "Você ainda não enviou documentos desta categoria. Use o campo abaixo para enviar."
              : "A EXP Tour disponibilizará seus documentos aqui assim que estiverem prontos."}
          </p>
        ) : (
          <div>{secao.grupos.flatMap((g: any) => g.itens.map((doc: any) => linhaDocumento(doc)))}</div>
        )}
        {podeEnviar(secao.valor) ? caixaUpload(secao) : null}
      </div>
    );
  }

  // Card de orientacao: passo a passo do passaporte + botao de afiliado do visto.
  function cardAjuda() {
    return (
      <div className="mb-4 rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-xl text-brand">Passaporte e visto</h2>
        <p className="mt-1 mb-3 text-xs text-neutral-400">Precisa tirar o passaporte ou solicitar o visto? A gente te orienta.</p>
        {/* Botao: como solicitar passaporte (abre/fecha o passo a passo) */}
        <button
          onClick={() => setMostrarPassaporte((v) => !v)}
          className="block w-full rounded-xl bg-brand px-3.5 py-3 text-center text-sm font-semibold text-brand-cream"
        >
          {mostrarPassaporte ? "Ocultar passo a passo" : "Como solicitar passaporte"}
        </button>
        {/* Painel com o passo a passo */}
        {mostrarPassaporte ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-neutral-700">
              {PASSOS_PASSAPORTE.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
            <p className="mt-3 rounded-lg bg-amber-100 px-2.5 py-2 text-xs text-amber-800">
              Menor de idade: é obrigatória a presença dos pais ou responsáveis no atendimento, com a documentação de autorização. Consulte sempre o site oficial para valores e regras atualizadas.
            </p>
            <a
              href="https://www.gov.br/pf/pt-br/assuntos/passaporte"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[13px] font-semibold text-brand-golddark underline"
            >
              Abrir site oficial da Polícia Federal →
            </a>
          </div>
        ) : null}
        {/* Botao: solicitar visto (afiliado) -- so aparece se a env existir */}
        {afiliadoVistoUrl ? (
          <a
            href={afiliadoVistoUrl}
            target="_blank"
            rel="noreferrer nofollow sponsored"
            className="mt-2.5 block w-full rounded-xl bg-brand-gold px-3.5 py-3 text-center text-sm font-semibold text-brand"
          >
            Solicitar visto com parceiro
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-8 md:grid md:grid-cols-2 md:gap-4 md:items-start">
      {cardAjuda()}
      {secoes.map((secao) => cardSecao(secao))}
    </div>
  );
}
