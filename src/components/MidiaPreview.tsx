"use client";

import { useState } from "react";

// Preview real (imagem/vídeo) ao lado do campo de URL de mídia, usado pelos 3
// editores de conteúdo do fornecedor (curso, escola, acomodação) — hoje o
// fornecedor só via a URL em texto, sem ver a foto/vídeo de verdade. Sem
// preview quando a URL está vazia; onError esconde a miniatura em vez de
// quebrar a tela (placeholder mudo, não crash).
//
// `kind` decide o tipo: "video" renderiza <video>; qualquer outro valor
// (image/photo/document/brochure/…) tenta <img> — documento/brochura sem
// imagem real simplesmente falha o load e some (onError), o que é aceitável
// aqui (o pedido cobre ao menos o caso mais comum, que é imagem).
export default function MidiaPreview({ url, kind }: { url: string; kind: string }) {
  const [falhou, setFalhou] = useState(false);
  const limpa = url.trim();
  if (!limpa || falhou) return null;

  const tamanho: React.CSSProperties = { maxWidth: 96, maxHeight: 72, borderRadius: 6, border: "1px solid var(--p-line)", objectFit: "cover", display: "block" };

  if (kind === "video") {
    return (
      <video
        src={limpa}
        controls
        style={{ ...tamanho, background: "#000" }}
        onError={() => setFalhou(true)}
      />
    );
  }
  if (kind === "document" || kind === "brochure") {
    // Sem preview confiável para PDF/documento com uma tag simples — evita
    // prometer um preview que a maioria das URLs de documento não vai cumprir.
    return null;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={limpa} alt="" style={tamanho} onError={() => setFalhou(true)} />;
}
