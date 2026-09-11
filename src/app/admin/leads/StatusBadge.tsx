import { STATUS_LEAD_LABEL, statusLeadValido } from "@/lib/leads";

// Selo de status do lead (compartilhado pela lista e pelo Caso 360). Cor + texto
// (nunca so cor). Segue a paleta do admin: dourado = atencao/proxima acao,
// verde da marca = fechado com negocio, cinza = encerrado.
const TOM: Record<string, string> = {
  novo: "bg-brand-gold/20 text-brand-golddark ring-brand-gold/30",
  em_contato: "bg-blue-50 text-blue-700 ring-blue-200",
  cotacao: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  convertido: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  descartado: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};

export default function StatusBadge({ status }: { status: string }) {
  const label = statusLeadValido(status) ? STATUS_LEAD_LABEL[status] : status;
  const tom = TOM[status] ?? "bg-neutral-100 text-neutral-600 ring-neutral-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tom}`}>
      {label}
    </span>
  );
}
