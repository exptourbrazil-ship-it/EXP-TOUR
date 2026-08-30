"use client";

// Botao "Imprimir / Salvar em PDF" da via integral. Usa a impressao do proprio
// navegador (Salvar como PDF) — sem lib de PDF no servidor. Escondido na
// impressao (print:hidden). Dourado = proxima acao (convencao da Area do Cliente).
export default function ImprimirBotao() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-full bg-brand-gold px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
    >
      <span aria-hidden>🖨️</span> Imprimir / Salvar em PDF
    </button>
  );
}
