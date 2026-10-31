"use client";

import { useEffect, useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, tipoTemValidade, tipoTemCobertura, tipoTemVoo, ehTipoDocumentoValido } from "@/lib/documentos";

// Um tipo é "conhecido" quando está no catálogo (evita exibir o 1º tipo como se
// fosse o real quando o doc tem um tipo legado/fora da lista).
function tipoConhecido(valor: string | null | undefined): boolean {
  return typeof valor === "string" && ehTipoDocumentoValido(valor);
}

const STATUS_OPCOES = ["pendente", "aprovado", "rejeitado"];

// Limite do envio pela tela (a Vercel recusa corpos acima de ~4,5 MB).
const TAMANHO_MAX_UPLOAD_ADMIN = 4 * 1024 * 1024;

type TitularBusca = { id: string; nome_completo: string; email: string | null; cpf_final: string | null };

// Escolha do cliente POR NOME (antes era por CPF). Busca no servidor a partir de
// 3 letras; mostra o final do CPF so para distinguir homonimos.
function SeletorCliente({
  idBase,
  rotulo,
  selecionado,
  onSelecionar,
}: {
  idBase: string;
  rotulo: string;
  selecionado: TitularBusca | null;
  onSelecionar: (t: TitularBusca | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<TitularBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (selecionado) return;
    const q = termo.trim();
    if (q.length < 3) {
      setOpcoes([]);
      setErro(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/admin/documentos/titulares?q=${encodeURIComponent(q)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) {
          setOpcoes([]);
          setErro(json.error || "Falha ao buscar clientes");
        } else {
          setOpcoes(json.titulares || []);
          setErro(null);
        }
      } catch {
        if (!cancelado) setErro("Falha de conexão na busca.");
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, selecionado]);

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  if (selecionado) {
    return (
      <div className="text-sm font-medium text-brand">
        {rotulo}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-neutral-300 px-3 py-2">
          <span className="min-w-0 truncate">
            {selecionado.nome_completo}
            {selecionado.cpf_final ? <span className="ml-2 text-xs text-neutral-500">CPF final {selecionado.cpf_final}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => {
              onSelecionar(null);
              setTermo("");
            }}
            className="shrink-0 text-xs font-medium text-brand underline"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm font-medium text-brand">
      <label htmlFor={idBase}>{rotulo}</label>
      <input
        id={idBase}
        type="text"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Digite o nome do cliente (mínimo 3 letras)"
        autoComplete="off"
        className={inputClasse}
      />
      {buscando ? <p className="mt-1 text-xs font-normal text-neutral-500">Buscando...</p> : null}
      {erro ? <p className="mt-1 text-xs font-normal text-red-700">{erro}</p> : null}
      {!buscando && !erro && termo.trim().length >= 3 && opcoes.length === 0 ? (
        <p className="mt-1 text-xs font-normal text-neutral-500">Nenhum cliente encontrado com esse nome.</p>
      ) : null}
      {opcoes.length > 0 ? (
        <ul className="mt-1 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white font-normal">
          {opcoes.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onSelecionar(o)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-cream/60"
              >
                <span className="min-w-0 truncate text-brand">{o.nome_completo}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {o.cpf_final ? `CPF final ${o.cpf_final}` : o.email || ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Tela admin de documentos: enviar um documento em nome do cliente e
// aprovar/rejeitar os documentos enviados pelo titular. A autenticacao e a
// sessao de admin (cookie) com a capacidade `documentos.analisar` — as rotas
// /api/admin/documentos* exigem ESSA sessao e nada mais: nao ha senha digitada
// aqui nem atalho por segredo de ambiente.
export default function DocumentosAdminClient() {
  const [clienteEnvio, setClienteEnvio] = useState<TitularBusca | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const [clienteBusca, setClienteBusca] = useState<TitularBusca | null>(null);
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteEnvio) {
      setResultado("Escolha o cliente pelo nome.");
      return;
    }
    if (!arquivo) {
      setResultado("Selecione um arquivo.");
      return;
    }
    // A Vercel recusa corpo acima de ~4,5 MB antes de a rota rodar, e a resposta
    // nem e JSON: o aviso tem de vir daqui, com a causa real.
    if (arquivo.size > TAMANHO_MAX_UPLOAD_ADMIN) {
      setResultado(`Erro: o arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB e o limite é 4 MB. Reduza o tamanho (comprima o PDF ou a foto) e envie de novo.`);
      return;
    }
    setCarregando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append("titularId", clienteEnvio.id);
      formData.append("tipoDocumento", tipoDocumento);
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/admin/documentos", { method: "POST", body: formData });
      let json: { ok?: boolean; error?: string; zoho?: { espelhado: boolean; motivo?: string } } = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }
      if (!res.ok) {
        setResultado(
          res.status === 413
            ? "Erro: o arquivo é grande demais para o envio (limite de 4 MB)."
            : `Erro: ${json.error || `falha no envio (código ${res.status})`}`,
        );
      } else if (json.zoho && !json.zoho.espelhado) {
        setResultado(`Documento enviado e salvo no portal.\nA cópia no Zoho CRM NÃO foi criada: ${json.zoho.motivo || "motivo desconhecido"}.`);
      } else {
        setResultado("Documento enviado com sucesso e copiado para o Zoho CRM.");
      }
      // Se a lista de baixo mostra o mesmo cliente, atualiza para o novo arquivo aparecer.
      if (res.ok && clienteBusca && clienteBusca.id === clienteEnvio.id) void carregarDocumentos(clienteBusca.id);
    } catch (err: any) {
      setResultado(`Erro: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarDocumentos(titularId: string) {
    setBuscando(true);
    setErroBusca(null);
    setDocumentos([]);
    try {
      const res = await fetch(`/api/admin/documentos/listar?titularId=${encodeURIComponent(titularId)}`);
      const json = await res.json();
      if (!res.ok) {
        setErroBusca(json.error || "falha desconhecida");
      } else {
        setDocumentos(json.documentos || []);
      }
    } catch (err: any) {
      setErroBusca(err.message);
    } finally {
      setBuscando(false);
    }
  }

  // Escolher o cliente já traz os documentos dele (sem botão Buscar).
  useEffect(() => {
    if (clienteBusca) void carregarDocumentos(clienteBusca.id);
    else {
      setDocumentos([]);
      setErroBusca(null);
    }
  }, [clienteBusca]);

  async function alterarStatus(id: string, status: string) {
    setAtualizandoId(id);
    try {
      const res = await fetch("/api/admin/documentos/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (res.ok) {
        setDocumentos((docs) => docs.map((d) => (d.id === id ? { ...d, status } : d)));
      } else {
        setErroBusca(json.error || "falha ao atualizar status");
      }
    } catch (err: any) {
      setErroBusca(err.message);
    } finally {
      setAtualizandoId(null);
    }
  }

  // Metadados de Vistos: tipo e/ou validade. Atualização otimista com rollback no
  // erro (mantém a linha consistente com o servidor). Envia só o(s) campo(s) tocado(s).
  async function salvarMetadados(
    id: string,
    patch: { tipoDocumento?: string; validade?: string | null; coberturaValor?: number | null; coberturaMoeda?: string | null; vooIda?: string | null; vooVolta?: string | null; vooCompra?: string | null },
  ) {
    const anterior = documentos.find((d) => d.id === id);
    setAtualizandoId(id);
    setErroBusca(null);
    setDocumentos((docs) =>
      docs.map((d) =>
        d.id === id
          ? {
              ...d,
              ...(patch.tipoDocumento !== undefined ? { tipo_documento: patch.tipoDocumento } : {}),
              ...(patch.validade !== undefined ? { validade: patch.validade } : {}),
              ...(patch.coberturaValor !== undefined ? { cobertura_valor: patch.coberturaValor } : {}),
              ...(patch.coberturaMoeda !== undefined ? { cobertura_moeda: patch.coberturaMoeda } : {}),
              ...(patch.vooIda !== undefined ? { passagem_data_ida: patch.vooIda } : {}),
              ...(patch.vooVolta !== undefined ? { passagem_data_volta: patch.vooVolta } : {}),
              ...(patch.vooCompra !== undefined ? { passagem_data_compra: patch.vooCompra } : {}),
            }
          : d,
      ),
    );
    try {
      const res = await fetch(`/api/admin/documentos/${id}/metadados`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        // Rollback ao estado anterior.
        setDocumentos((docs) => docs.map((d) => (d.id === id && anterior ? anterior : d)));
        setErroBusca(json.error || "falha ao salvar metadados");
      }
    } catch (err: any) {
      setDocumentos((docs) => docs.map((d) => (d.id === id && anterior ? anterior : d)));
      setErroBusca(err.message);
    } finally {
      setAtualizandoId(null);
    }
  }

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-2xl text-brand">Adicionar documento do cliente</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Envie documentos adicionais (ou financeiros) que não vieram automaticamente do Zoho.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <SeletorCliente idBase="cliente-envio" rotulo="Cliente" selecionado={clienteEnvio} onSelecionar={setClienteEnvio} />

        <label className="text-sm font-medium text-brand">
          Tipo de documento
          <select
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value)}
            className={inputClasse}
          >
            {CATEGORIAS_DOCUMENTO.map((cat) => (
              <optgroup key={cat.valor} label={cat.label}>
                {TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor).map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-brand">
          Arquivo (PDF, JPG, PNG ou WEBP, até 4 MB)
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            required
            className="mt-1 block w-full text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="mt-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition disabled:opacity-60"
        >
          {carregando ? "Enviando..." : "Enviar documento"}
        </button>
      </form>
      {resultado ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{resultado}</p>
      ) : null}

      <hr className="my-8 border-neutral-200" />

      <h2 className="font-serif text-2xl text-brand">Aprovar ou rejeitar documentos</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Escolha o cliente pelo nome para ver os documentos dele, abrir o arquivo e alterar o status de cada um.
      </p>

      <div className="mt-4">
        <SeletorCliente idBase="cliente-busca" rotulo="Cliente" selecionado={clienteBusca} onSelecionar={setClienteBusca} />
        {buscando ? <p className="mt-2 text-sm text-neutral-500">Carregando documentos...</p> : null}
      </div>

      {erroBusca ? <p className="mt-3 text-sm text-red-700">{erroBusca}</p> : null}

      {clienteBusca && !buscando && !erroBusca && documentos.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Este cliente ainda não tem documentos.</p>
      ) : null}

      {documentos.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-brand">{doc.nome_arquivo}</span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <a
                    href={`/api/admin/documentos/${doc.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
                  >
                    Ver
                  </a>
                  <select
                    value={doc.status || "pendente"}
                    disabled={atualizandoId === doc.id}
                    onChange={(e) => alterarStatus(doc.id, e.target.value)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Metadados de Vistos: reclassificar o tipo e, quando o tipo carrega
                  validade (passaporte, visto, seguro...), a data de expiração. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
                <label className="flex items-center gap-1 text-xs text-neutral-500">
                  Tipo
                  <select
                    value={tipoConhecido(doc.tipo_documento) ? doc.tipo_documento : "__desconhecido__"}
                    disabled={atualizandoId === doc.id}
                    onChange={(e) => {
                      if (e.target.value === "__desconhecido__") return; // sentinela não salva
                      salvarMetadados(doc.id, { tipoDocumento: e.target.value });
                    }}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                  >
                    {/* Tipo legado/fora do catálogo: sentinela para não exibir o
                        primeiro tipo como se fosse o real nem reclassificar sem querer. */}
                    {!tipoConhecido(doc.tipo_documento) ? (
                      <option value="__desconhecido__">{`(atual: ${doc.tipo_documento || "—"})`}</option>
                    ) : null}
                    {CATEGORIAS_DOCUMENTO.map((cat) => (
                      <optgroup key={cat.valor} label={cat.label}>
                        {TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor).map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {tipoTemValidade(doc.tipo_documento) ? (
                  <label className="flex items-center gap-1 text-xs text-neutral-500">
                    Validade
                    <input
                      type="date"
                      value={(doc.validade || "").slice(0, 10)}
                      disabled={atualizandoId === doc.id}
                      onChange={(e) => {
                        const novo = e.target.value || null;
                        const atual = (doc.validade || "").slice(0, 10) || null;
                        if (novo !== atual) salvarMetadados(doc.id, { validade: novo });
                      }}
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                    />
                  </label>
                ) : null}

                {tipoTemCobertura(doc.tipo_documento) ? (
                  <>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      Cobertura
                      <input
                        type="number"
                        min={0}
                        step="1000"
                        value={doc.cobertura_valor ?? ""}
                        disabled={atualizandoId === doc.id}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const novo = raw === "" ? null : Number(raw);
                          const atual = doc.cobertura_valor ?? null;
                          if (novo !== atual) salvarMetadados(doc.id, { coberturaValor: novo });
                        }}
                        className="w-28 rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      Moeda
                      <input
                        type="text"
                        maxLength={5}
                        placeholder="EUR"
                        value={doc.cobertura_moeda ?? ""}
                        disabled={atualizandoId === doc.id}
                        onBlur={(e) => {
                          const raw = e.target.value.trim().toUpperCase();
                          const novo = raw === "" ? null : raw;
                          const atual = doc.cobertura_moeda ?? null;
                          if (novo !== atual) salvarMetadados(doc.id, { coberturaMoeda: novo });
                        }}
                        className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-sm uppercase text-brand"
                      />
                    </label>
                  </>
                ) : null}

                {tipoTemVoo(doc.tipo_documento) ? (
                  <>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      Ida
                      <input
                        type="date"
                        value={(doc.passagem_data_ida || "").slice(0, 10)}
                        disabled={atualizandoId === doc.id}
                        onChange={(e) => {
                          const novo = e.target.value || null;
                          const atual = (doc.passagem_data_ida || "").slice(0, 10) || null;
                          if (novo !== atual) salvarMetadados(doc.id, { vooIda: novo });
                        }}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      Volta
                      <input
                        type="date"
                        value={(doc.passagem_data_volta || "").slice(0, 10)}
                        disabled={atualizandoId === doc.id}
                        onChange={(e) => {
                          const novo = e.target.value || null;
                          const atual = (doc.passagem_data_volta || "").slice(0, 10) || null;
                          if (novo !== atual) salvarMetadados(doc.id, { vooVolta: novo });
                        }}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      Compra
                      <input
                        type="date"
                        value={(doc.passagem_data_compra || "").slice(0, 10)}
                        disabled={atualizandoId === doc.id}
                        onChange={(e) => {
                          const novo = e.target.value || null;
                          const atual = (doc.passagem_data_compra || "").slice(0, 10) || null;
                          if (novo !== atual) salvarMetadados(doc.id, { vooCompra: novo });
                        }}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-brand"
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
