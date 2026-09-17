"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MaterialAdmin } from "@/lib/material-service";
import {
  TIPOS_MATERIAL,
  TIPO_MATERIAL_LABEL,
  IDIOMAS_MATERIAL,
  PERMISSOES_MATERIAL,
  PERMISSAO_LABEL,
  type TipoMaterial,
  type PermissaoMaterial,
} from "@/lib/material-helpers";
import { STATUS_LEITURA_LABEL, tipoLegivel, type StatusLeitura } from "@/lib/material-leitura";
import MateriaisListClient from "@/app/admin/materiais/MateriaisListClient";

const IDIOMA_LABEL: Record<string, string> = { en: "EN", pt: "PT", es: "ES" };
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

// Badge da leitura por IA (F3.1).
const LEITURA_BADGE: Record<string, string> = {
  pendente: "bg-neutral-100 text-neutral-600",
  lendo: "bg-blue-50 text-blue-700",
  lida: "bg-emerald-100 text-emerald-700",
  sem_ia: "bg-amber-50 text-amber-700",
  erro: "bg-red-50 text-red-700",
  precisa_campus: "bg-amber-50 text-amber-800",
  nao_suportado: "bg-neutral-100 text-neutral-500",
};
const PROPOSTA_LABEL: Record<string, string> = {
  draft: "rascunho",
  pending_admin: "aguardando sua aprovação",
  processing: "publicando…",
  approved: "publicada",
  rejected: "recusada",
};

type Proposta = { id: string; status: string; tipo: "preco" | "curso" | "acomodacao" | "escola" | "promocao" | "disponibilidade"; href: string };
const TIPO_PROPOSTA_LABEL: Record<Proposta["tipo"], string> = { preco: "preço", curso: "curso", acomodacao: "acomodação", escola: "escola", promocao: "promoção", disponibilidade: "datas" };

// Aba Material do hub (F2 + F3.1): (1) fila "Aguardando aprovação" com Publicar/Recusar
// (motivo obrigatório); (2) "Price lists — leitura por IA" (botão Ler, badge, link para a
// proposta de preço gerada); (3) "+ Adicionar material" pelo admin; (4) biblioteca.
// Todas as escritas vão a POST /api/admin/suppliers/[id]/materiais.
export default function MateriaisHubClient({
  supplierId,
  pendentes,
  demais,
  hoje,
  campi,
  propostas,
}: {
  supplierId: string;
  pendentes: MaterialAdmin[];
  demais: MaterialAdmin[];
  hoje: string;
  campi: Array<{ id: string; nome: string }>;
  propostas: Record<string, Proposta[]>;
}) {
  const router = useRouter();
  const endpoint = `/api/admin/suppliers/${supplierId}/materiais`;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null); // feedback positivo/informativo da leitura
  const [recusando, setRecusando] = useState<string | null>(null); // id com o campo de motivo aberto
  const [motivo, setMotivo] = useState("");
  const [campusEscolhido, setCampusEscolhido] = useState<Record<string, string>>({});

  async function acaoJson(body: Record<string, unknown>, chave: string): Promise<Record<string, unknown> | null> {
    setOcupado(chave);
    setErro(null);
    try {
      const resp = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json?.error?.message ?? "Não foi possível concluir a ação.");
        return null;
      }
      router.refresh();
      return (json.data as Record<string, unknown>) ?? {};
    } catch {
      setErro("Falha de rede. Tente novamente.");
      return null;
    } finally {
      setOcupado(null);
    }
  }

  // `vistoEm` = a versao (updated_at) que esta na tela: o servidor so publica/recusa
  // se o fornecedor NAO tiver editado no meio (senao pede para recarregar).
  async function aprovar(m: MaterialAdmin) {
    await acaoJson({ acao: "aprovar", id: m.id, vistoEm: m.atualizadoEm ?? null }, `aprovar:${m.id}`);
  }
  async function recusar(m: MaterialAdmin) {
    if (!motivo.trim()) {
      setErro("Escreva o motivo da recusa — o fornecedor vai lê-lo para corrigir.");
      return;
    }
    const ok = await acaoJson(
      { acao: "rejeitar", id: m.id, motivo: motivo.trim(), vistoEm: m.atualizadoEm ?? null },
      `rejeitar:${m.id}`,
    );
    if (ok) {
      setRecusando(null);
      setMotivo("");
    }
  }
  async function arquivar(id: string) {
    if (!window.confirm("Arquivar este material? Ele sai da biblioteca e da cotação.")) return;
    await acaoJson({ acao: "arquivar", id }, `arquivar:${id}`);
  }
  async function ler(m: MaterialAdmin, forcar: boolean) {
    const campusId = campi.length === 1 ? campi[0].id : campusEscolhido[m.id] || null;
    if (campi.length > 1 && !campusId) {
      setErro("Escolha o campus da proposta antes de ler.");
      return;
    }
    setAviso(null);
    const r = await acaoJson({ acao: "ler", id: m.id, campusId, forcar }, `ler:${m.id}`);
    if (!r) return;
    const st = String(r.status ?? "");
    const detalhe = r.erro ? String(r.erro) : "";
    if (st === "lida") setAviso(r.resumo ? `Lido. ${String(r.resumo)} — revise e publique.` : `Proposta gerada (${String(r.itens ?? 0)} itens) — revise e publique.`);
    else if (st === "ja_lida") setAviso("Já existe uma proposta aberta deste material — revise-a, ou use \"Ler de novo\" para substituí-la.");
    else if (st === "sem_ia") setErro("A IA não está configurada neste ambiente (GEMINI_API_KEY ou ANTHROPIC_API_KEY). O material segue na fila; nada foi gerado.");
    else if (st === "precisa_campus") setErro(detalhe || "Escolha o campus da proposta.");
    else if (st === "em_leitura") setAviso("Leitura já em andamento — aguarde e atualize a página.");
    else if (st === "pendente") setAviso(`Falha temporária (${detalhe}) — o material voltou à fila e será relido.`);
    else if (st === "erro") setErro(`Falha na leitura: ${detalhe || "erro"}.`);
    else if (st === "nao_legivel") setErro(detalhe || "Este material não pode ser lido.");
  }

  // Materiais legiveis (price list, brochura; qualquer status de aprovacao, exceto
  // recusados) para a secao de leitura por IA.
  const legiveis = [...pendentes, ...demais].filter((m) => tipoLegivel(m.tipo) && m.status !== "rejeitado");

  return (
    <div className="space-y-8">
      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div> : null}
      {aviso ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div> : null}

      {/* 1) Fila de aprovação */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-serif text-base text-brand">Aguardando aprovação</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pendentes.length ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"}`}>
            {pendentes.length}
          </span>
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Enviado pelo fornecedor no portal. Só o que você <strong>publicar</strong> alcança cliente e cotação. A auditoria
          por IA entra nesta fila nas próximas etapas.
        </p>
        {pendentes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada aguardando aprovação.</p>
        ) : (
          <ul className="space-y-2">
            {pendentes.map((m) => {
              const abertoRecusa = recusando === m.id;
              return (
                <li key={m.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand">{m.titulo}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo} · {IDIOMA_LABEL[m.idioma] || m.idioma}
                        {m.programa ? ` · ${m.programa}` : ""}
                        {m.validade ? ` · validade ${m.validade}` : ""}
                        {" · "}
                        <span className={m.permissao === "cliente" ? "text-green-700" : "text-amber-700"}>
                          {m.permissao === "cliente" ? "exposto ao cliente" : "uso interno"}
                        </span>
                        {m.submittedBy ? ` · enviado por ${m.submittedBy}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {m.temArquivo ? (
                        <a href={`/api/admin/materiais/${m.id}/download`} className="text-sm text-brand-golddark hover:underline">
                          Baixar
                        </a>
                      ) : m.linkUrl ? (
                        <Link href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-golddark hover:underline">
                          Abrir link
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        disabled={!!ocupado}
                        onClick={() => aprovar(m)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {ocupado === `aprovar:${m.id}` ? "…" : "Publicar"}
                      </button>
                      <button
                        type="button"
                        disabled={!!ocupado}
                        onClick={() => {
                          setRecusando(abertoRecusa ? null : m.id);
                          setMotivo("");
                          setErro(null);
                        }}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                  {abertoRecusa ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <label className="block text-xs font-medium text-red-800">Motivo da recusa (o fornecedor vai ler)</label>
                      <textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm"
                        placeholder="Ex.: preços desatualizados — enviar a versão 2027; ou: imagem em baixa resolução."
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={!!ocupado}
                          onClick={() => recusar(m)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {ocupado === `rejeitar:${m.id}` ? "…" : "Confirmar recusa"}
                        </button>
                        <button type="button" onClick={() => setRecusando(null)} className="text-xs text-neutral-500 hover:underline">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2) Leitura por IA (F3.1): price lists -> proposta de preco pendente */}
      <section>
        <h3 className="mb-1 font-serif text-base text-brand">Leitura por IA — price lists, brochuras, promoções e datas</h3>
        <p className="mb-3 text-xs text-neutral-500">
          <strong>Price list (PDF)</strong> vira uma proposta de <strong>preço</strong> (programas, acomodações, taxas);
          <strong> brochura (PDF ou imagem)</strong> vira propostas de <strong>conteúdo</strong> dos cursos/acomodações que
          ela descreve e do bloco da escola; <strong>promoção/flyer (PDF ou imagem)</strong> — e ofertas citadas em price lists e
          brochuras — viram propostas de <strong>promoção</strong> com prazo; <strong>calendário (PDF ou imagem)</strong> — e datas
          citadas nos demais — vira uma proposta de <strong>datas de início</strong> comparada ao publicado. Tudo fica aguardando <strong>sua aprovação</strong> — nada chega à cotação
          sem você publicar. A fila é lida automaticamente uma vez por dia; use o botão para ler agora.
        </p>
        {legiveis.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum price list ou brochura neste fornecedor.</p>
        ) : (
          <ul className="space-y-2">
            {legiveis.map((m) => {
              const st = (m.leituraStatus || "nao_aplicavel") as StatusLeitura;
              const lista = propostas[m.id] ?? [];
              // 'lendo' esconde o botao; se o claim ficou obsoleto (processo morreu), o cron
              // retoma sozinho no proximo ciclo e o servidor tambem aceita reler.
              const podeBotao = st !== "lendo" && st !== "nao_suportado";
              const rotuloBotao = st === "pendente" ? "Ler com IA" : "Ler de novo";
              return (
                <li key={m.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand">
                        {m.titulo}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${LEITURA_BADGE[st] ?? "bg-neutral-100 text-neutral-500"}`}>
                          {STATUS_LEITURA_LABEL[st] ?? st}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo} · {m.nomeArquivo ?? (m.linkUrl ? "link" : "arquivo")}
                        {m.leituraErro ? <span className="text-red-600"> · {m.leituraErro}</span> : null}
                      </div>
                      {lista.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                          {lista.map((p) => (
                            <li key={p.id}>
                              <Link href={p.href} className="font-medium text-brand-golddark hover:underline">
                                {TIPO_PROPOSTA_LABEL[p.tipo]} · {PROPOSTA_LABEL[p.status] ?? p.status} →
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {campi.length > 1 && podeBotao ? (
                        <select
                          className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                          value={campusEscolhido[m.id] ?? ""}
                          onChange={(e) => setCampusEscolhido((c) => ({ ...c, [m.id]: e.target.value }))}
                        >
                          <option value="">Campus da proposta…</option>
                          {campi.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      ) : null}
                      {podeBotao ? (
                        <button
                          type="button"
                          disabled={!!ocupado}
                          onClick={() => ler(m, st !== "pendente")}
                          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-cream disabled:opacity-50"
                        >
                          {ocupado === `ler:${m.id}` ? "Lendo…" : rotuloBotao}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3) Adicionar material pelo admin */}
      <AdicionarMaterial endpoint={endpoint} />

      {/* 4) Biblioteca (publicados + recusados), com status e arquivar */}
      <section>
        <h3 className="mb-2 font-serif text-base text-brand">Biblioteca</h3>
        <MateriaisListClient materiais={demais} hoje={hoje} onArquivar={arquivar} />
      </section>
    </div>
  );
}

function AdicionarMaterial({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [tipo, setTipo] = useState<TipoMaterial>("brochura");
  const [titulo, setTitulo] = useState("");
  const [idioma, setIdioma] = useState("en");
  const [permissao, setPermissao] = useState<PermissaoMaterial>("cliente");
  const [programa, setPrograma] = useState("");
  const [validade, setValidade] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const meta = { tipo, titulo, idioma, permissao, programa, validade };
      let resp: Response;
      if (modo === "arquivo") {
        if (!arquivo) {
          setErro("Escolha um arquivo (PDF ou imagem).");
          return;
        }
        const fd = new FormData();
        Object.entries(meta).forEach(([k, v]) => fd.set(k, v));
        fd.set("arquivo", arquivo);
        resp = await fetch(endpoint, { method: "POST", body: fd });
      } else {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "criar_link", ...meta, linkUrl }),
        });
      }
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json?.error?.message ?? "Não foi possível salvar o material.");
        return;
      }
      setTitulo(""); setPrograma(""); setValidade(""); setLinkUrl(""); setArquivo(null);
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-base text-brand">Adicionar material</h3>
          <p className="text-xs text-neutral-500">
            Material que você já tem ou recebeu por fora. Entra <strong>publicado</strong>; price list em PDF também entra
            na fila de leitura por IA.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream"
        >
          {aberto ? "Fechar" : "+ Adicionar material"}
        </button>
      </div>

      {aberto ? (
        <form onSubmit={adicionar} className="mt-4 space-y-3">
          <div className="flex gap-2">
            {(["arquivo", "link"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${modo === m ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand hover:bg-neutral-50"}`}
              >
                {m === "arquivo" ? "Arquivo (PDF/imagem)" : "Link (vídeo/URL)"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Título</label>
              <input className={inp} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Brochura General English 2026" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Tipo</label>
              <select className={inp} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMaterial)}>
                {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{TIPO_MATERIAL_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Idioma</label>
              <select className={inp} value={idioma} onChange={(e) => setIdioma(e.target.value)}>
                {IDIOMAS_MATERIAL.map((i) => <option key={i} value={i}>{IDIOMA_LABEL[i]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Permissão de uso</label>
              <select className={inp} value={permissao} onChange={(e) => setPermissao(e.target.value as PermissaoMaterial)}>
                {PERMISSOES_MATERIAL.map((p) => <option key={p} value={p}>{PERMISSAO_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Validade (opcional)</label>
              <input className={inp} type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Programa relacionado (opcional)</label>
              <input className={inp} value={programa} onChange={(e) => setPrograma(e.target.value)} placeholder="Ex.: General English" />
            </div>
            {modo === "arquivo" ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-600">Arquivo (PDF, JPG, PNG, WEBP — até 10 MB)</label>
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-sm" />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-600">Link (YouTube/Vimeo ou outra URL)</label>
                <input className={inp} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
          </div>
          {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
          <button type="submit" disabled={ocupado} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
            {ocupado ? "Salvando…" : "Salvar e publicar"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
