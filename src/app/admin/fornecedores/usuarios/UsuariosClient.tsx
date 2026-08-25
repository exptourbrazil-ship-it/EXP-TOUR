"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PAPEIS_SUPPLIER_USER,
  PAPEL_SUPPLIER_USER_LABEL,
  type PapelSupplierUser,
} from "@/lib/supplier-user-admin";

export type UsuarioFornecedor = {
  id: string;
  name: string;
  email: string;
  role: string;
  language: string;
  active: boolean;
  origem: "zoho" | "manual";
};

export type SupplierComUsuarios = {
  id: string;
  displayName: string;
  countryCode: string | null;
  usuarios: UsuarioFornecedor[];
};

const IDIOMA_LABEL: Record<string, string> = { en: "Inglês", pt: "Português" };

export default function UsuariosClient({ suppliers }: { suppliers: SupplierComUsuarios[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [abertoId, setAbertoId] = useState(null as string | null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  // Campos do convite (um formulario por vez, atrelado ao supplier aberto).
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("supplier_admin" as PapelSupplierUser);
  const [idioma, setIdioma] = useState("en");
  const [enviarEmail, setEnviarEmail] = useState(true);

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo
    ? suppliers.filter((s) => s.displayName.toLowerCase().includes(termo))
    : suppliers;

  function abrirConvite(supplierId: string) {
    setAbertoId(supplierId);
    setNome("");
    setEmail("");
    setPapel("supplier_admin");
    setIdioma("en");
    setEnviarEmail(true);
    setMsg(null);
  }

  async function convidar(supplierId: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/suppliers/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, name: nome, email, role: papel, language: idioma, enviarEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha ao criar o usuário." });
      } else {
        const aviso = json.avisoEmail
          ? " (usuário criado, mas o e-mail de convite falhou — use Reenviar convite)"
          : enviarEmail
            ? " Convite enviado por e-mail."
            : "";
        setMsg({ tipo: "ok", texto: `Acesso criado.${aviso}` });
        setAbertoId(null);
        router.refresh();
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
    } finally {
      setOcupado(false);
    }
  }

  async function acaoUsuario(id: string, corpo: Record<string, unknown>, okTexto: string) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/suppliers/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha na operação." });
      } else {
        setMsg({ tipo: "ok", texto: okTexto });
        router.refresh();
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-brand">Usuários do fornecedor</h1>
        <Link href="/admin/fornecedores" className="text-sm text-neutral-500 hover:text-brand">
          ← Sincronização
        </Link>
      </div>
      <p className="mb-5 text-sm text-neutral-600">
        Convide acessos ao Portal do Parceiro à mão — escolas sem e-mail no Zoho ou um segundo
        contato. Usuários criados aqui <strong>não são tocados</strong> pela sincronização de
        Vendors. O portal é sem senha: o convidado entra informando o e-mail e recebe um código.
      </p>

      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar fornecedor…"
        className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />

      {msg ? (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            msg.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      ) : null}

      <div className="space-y-3">
        {visiveis.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-brand">{s.displayName}</p>
                <p className="text-xs text-neutral-400">
                  {s.countryCode || "—"} · {s.usuarios.length}{" "}
                  {s.usuarios.length === 1 ? "acesso" : "acessos"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => (abertoId === s.id ? setAbertoId(null) : abrirConvite(s.id))}
                disabled={ocupado}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60"
              >
                {abertoId === s.id ? "Cancelar" : "Convidar usuário"}
              </button>
            </div>

            {s.usuarios.length > 0 ? (
              <ul className="mt-3 divide-y divide-neutral-100">
                {s.usuarios.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-800">
                        {u.email}
                        {!u.active ? (
                          <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">
                            inativo
                          </span>
                        ) : null}
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                          {u.origem === "zoho" ? "Zoho" : "manual"}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-400">
                        {u.name} · {PAPEL_SUPPLIER_USER_LABEL[u.role as PapelSupplierUser] || u.role}{" "}
                        · {IDIOMA_LABEL[u.language] || u.language}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-xs">
                      {u.active ? (
                        <button
                          type="button"
                          onClick={() => acaoUsuario(u.id, { reenviarConvite: true }, "Convite reenviado.")}
                          disabled={ocupado}
                          className="text-brand hover:underline disabled:opacity-60"
                        >
                          Reenviar convite
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          acaoUsuario(
                            u.id,
                            { active: !u.active },
                            u.active ? "Acesso desativado." : "Acesso reativado."
                          )
                        }
                        disabled={ocupado}
                        className={`hover:underline disabled:opacity-60 ${
                          u.active ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {u.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-neutral-400">Nenhum acesso ainda.</p>
            )}

            {abertoId === s.id ? (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-neutral-600">
                    Nome
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                      placeholder="Nome do contato"
                    />
                  </label>
                  <label className="text-xs text-neutral-600">
                    E-mail (login)
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                      placeholder="pessoa@escola.com"
                    />
                  </label>
                  <label className="text-xs text-neutral-600">
                    Papel
                    <select
                      value={papel}
                      onChange={(e) => setPapel(e.target.value as PapelSupplierUser)}
                      className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {PAPEIS_SUPPLIER_USER.map((p) => (
                        <option key={p} value={p}>
                          {PAPEL_SUPPLIER_USER_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-neutral-600">
                    Idioma dos e-mails
                    <select
                      value={idioma}
                      onChange={(e) => setIdioma(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="en">Inglês</option>
                      <option value="pt">Português</option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={enviarEmail}
                    onChange={(e) => setEnviarEmail(e.target.checked)}
                  />
                  Enviar convite de boas-vindas por e-mail
                </label>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => convidar(s.id)}
                    disabled={ocupado}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {ocupado ? "Criando…" : "Criar acesso"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {visiveis.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum fornecedor encontrado.</p>
        ) : null}
      </div>
    </div>
  );
}
