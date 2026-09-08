"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MaterialAdmin } from "@/lib/material-service";
import { resumoMateriais, somarDiasISO, dataIsoValida, TIPO_MATERIAL_LABEL, type TipoMaterial } from "@/lib/material-helpers";
import { normalizarBusca } from "@/lib/clientes";

const IDIOMA_LABEL: Record<string, string> = { en: "EN", pt: "PT", es: "ES" };

const FILTROS = [
  { k: "", label: "Todos" },
  { k: "vencendo", label: "Vencendo" },
  { k: "vencidos", label: "Vencidos" },
];

// Lista de materiais: indicadores de topo (total/cliente/vencendo/vencidos),
// filtro por validade, busca sem acento (título/escola/programa) e badges.
// Client-side sobre a lista já carregada e filtrada por escola no servidor.
export default function MateriaisListClient({ materiais, hoje }: { materiais: MaterialAdmin[]; hoje: string }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");

  const resumo = useMemo(() => resumoMateriais(materiais, hoje), [materiais, hoje]);
  const limite = useMemo(() => somarDiasISO(hoje, 30), [hoje]);

  // Material "vencendo": ainda válido, mas dentro da janela de 30 dias.
  function vencendo(m: MaterialAdmin): boolean {
    return !m.vencido && !!limite && !!m.validade && dataIsoValida(m.validade) && m.validade >= hoje && m.validade <= limite;
  }

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return materiais.filter((m) => {
      if (filtro === "vencidos" && !m.vencido) return false;
      if (filtro === "vencendo" && !vencendo(m)) return false;
      if (!termo) return true;
      return normalizarBusca([m.titulo, m.supplierNome, m.programa].filter(Boolean).join(" ")).includes(termo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiais, busca, filtro, limite, hoje]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardIndicador titulo="Materiais" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador titulo="Para o cliente" valor={String(resumo.cliente)} legenda="anexáveis à proposta" />
        <CardIndicador titulo="Vencendo" valor={String(resumo.vencendo)} legenda="em até 30 dias" tom={resumo.vencendo > 0 ? "atencao" : undefined} />
        <CardIndicador titulo="Vencidos" valor={String(resumo.vencidos)} legenda="fora de validade" tom={resumo.vencidos > 0 ? "alerta" : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k || "todos"}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                ativo ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand hover:bg-neutral-50"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por título, escola ou programa"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />

      {materiais.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum material.</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum material para o filtro/busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Escola</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Permissão</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtradas.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">
                    {m.titulo}
                    {m.vencido ? (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">vencido</span>
                    ) : vencendo(m) ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">vencendo</span>
                    ) : null}
                    {m.programa ? <div className="text-xs text-neutral-400">{m.programa}</div> : null}
                  </td>
                  <td className="px-4 py-2">{m.supplierNome || "—"}</td>
                  <td className="px-4 py-2">
                    {TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo} · {IDIOMA_LABEL[m.idioma] || m.idioma}
                  </td>
                  <td className="px-4 py-2">
                    <span className={m.permissao === "cliente" ? "text-green-700" : "text-amber-700"}>
                      {m.permissao === "cliente" ? "cliente" : "interno"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {m.temArquivo ? (
                      <a href={`/api/admin/materiais/${m.id}/download`} className="text-brand-golddark hover:underline">
                        Baixar
                      </a>
                    ) : m.linkUrl ? (
                      <Link href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="text-brand-golddark hover:underline">
                        Abrir link
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        {filtradas.length} de {materiais.length} material(is).
      </p>
    </>
  );
}

function CardIndicador({
  titulo,
  valor,
  legenda,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  tom?: "atencao" | "alerta";
}) {
  const corValor = tom === "alerta" ? "text-red-700" : tom === "atencao" ? "text-amber-700" : "text-brand";
  const corBorda = tom === "alerta" ? "border-red-200" : tom === "atencao" ? "border-amber-200" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
