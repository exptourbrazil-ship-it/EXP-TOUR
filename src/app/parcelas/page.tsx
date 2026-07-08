"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Parcela = {
id: string;
numero: number;
descricao: string;
valor_atual: number;
vencimento: string;
status: "pendente" | "pago" | "atrasado";
is_entrada: boolean;
payment_link: string | null;
qr_code_url: string | null;
};

// TODO: substituir por titular_id vindo da sessao autenticada (CPF + codigo WhatsApp).
// Por enquanto aceita ?titular=ID na URL apenas para desenvolvimento.
export default function ParcelasPage() {
const [parcelas, setParcelas] = useState<Parcela[]>([]);
const [loading, setLoading] = useState(true);
const [erro, setErro] = useState<string | null>(null);

useEffect(() => {
async function load() {
const params = new URLSearchParams(window.location.search);
const titularId = params.get("titular");

if (!titularId) {
setErro("Sessao nao identificada. Faca login novamente.");
setLoading(false);
return;
}

const { data: contratos, error: contratosError } = await supabase
.from("contratos")
.select("id")
.eq("titular_id", titularId);

if (contratosError || !contratos || contratos.length === 0) {
setErro("Nao foi possivel carregar seus contratos.");
setLoading(false);
return;
}

const contratoIds = contratos.map((c) => c.id);

const { data, error } = await supabase
.from("parcelas")
.select("*")
.in("contrato_id", contratoIds)
.order("numero", { ascending: true });

if (error) {
setErro("Nao foi possivel carregar as parcelas.");
} else {
setParcelas(data as Parcela[]);
}
setLoading(false);
}

load();
}, []);

if (loading) return <p className="p-6 text-sm text-neutral-600">Carregando parcelas...</p>;
if (erro) return <p className="p-6 text-sm text-red-600">{erro}</p>;

return (
<main className="mx-auto max-w-3xl p-6">
<h1 className="mb-6 text-2xl font-semibold text-brand">Parcelas</h1>
<div className="space-y-3">
{parcelas.map((p) => (
<div
key={p.id}
className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
>
<div>
<p className="font-medium">{p.descricao}</p>
<p className="text-sm text-neutral-500">
Vencimento: {new Date(p.vencimento).toLocaleDateString("pt-BR")}
</p>
</div>
<div className="text-right">
<p className="font-semibold">
{p.valor_atual.toLocaleString("pt-BR", { style: "currency", currency: "CAD" })}
</p>
{p.status === "pago" ? (
<span className="text-sm font-medium text-green-600">Pago</span>
) : p.payment_link ? (
<a
href={p.payment_link}
target="_blank"
rel="noreferrer"
className="text-sm font-medium text-brand underline"
>
Pagar agora
</a>
) : (
<span className="text-sm text-neutral-500">Pendente</span>
)}
</div>
</div>
))}
</div>
</main>
);
}
