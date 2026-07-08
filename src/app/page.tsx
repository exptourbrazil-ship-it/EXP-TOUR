"use client";

import { useState } from "react";

export default function LoginPage() {
const [cpf, setCpf] = useState("");
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState<string | null>(null);

async function handleSubmit(e: React.FormEvent) {
e.preventDefault();
setLoading(true);
setMessage(null);
try {
const res = await fetch("/api/auth/request-code", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ cpf }),
});
if (!res.ok) throw new Error("Falha ao solicitar codigo");
setMessage("Codigo enviado para o seu WhatsApp.");
} catch (err) {
setMessage("Nao foi possivel enviar o codigo. Verifique o CPF informado.");
} finally {
setLoading(false);
}
}

return (
<main className="flex min-h-screen items-center justify-center p-6">
<div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
<h1 className="mb-2 text-2xl font-semibold text-brand">Area do cliente</h1>
<p className="mb-6 text-sm text-neutral-600">
Informe seu CPF. Enviaremos um codigo de acesso no seu WhatsApp - voce vera apenas os seus contratos.
</p>
<form onSubmit={handleSubmit} className="space-y-4">
<div>
<label className="mb-1 block text-sm font-medium">CPF</label>
<input
type="text"
required
value={cpf}
onChange={(e) => setCpf(e.target.value)}
placeholder="000.000.000-00"
className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
/>
</div>
<button
type="submit"
disabled={loading}
className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
>
{loading ? "Enviando..." : "Receber codigo no WhatsApp"}
</button>
</form>
{message && <p className="mt-4 text-sm text-neutral-700">{message}</p>}
</div>
</main>
);
}
