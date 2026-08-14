// Validacao de arquivos enviados por clientes e admins.
//
// Contexto (o que estava errado antes):
//
//  1. A chave do objeto era montada com o nome do arquivo vindo do multipart:
//     `${titularId}/${Date.now()}-${arquivo.name}`. O nome e controlado por
//     quem envia, e a storage-js monta a URL sem escapar ".."
//     (`_getFinalPath` faz apenas `${bucketId}/${path.replace(/^\/+/,"")}`).
//     O parser de URL do fetch entao colapsa os segmentos, e um arquivo
//     chamado "../../../../documentos-admin/x.html" era gravado em OUTRO
//     bucket. Por isso o nome do cliente nao entra mais na chave: a chave e
//     derivada de UUID, e o nome original vira apenas coluna de exibicao.
//
//  2. Nao havia allowlist de tipo nem verificacao do conteudo. O contentType
//     era copiado do que o cliente declarava, entao dava para subir um HTML
//     com <script> e faze-lo ser servido inline pelo Storage quando o admin
//     abrisse o documento — execucao na mesma origem que hospeda /rest/v1.
//
//  3. Nao havia teto de tamanho.

import crypto from "node:crypto";

export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

// So o que faz sentido para um cofre de documentos: PDF e imagem.
export const MIMES_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export type ResultadoValidacao =
  | { ok: true; mime: string; extensao: string }
  | { ok: false; erro: string };

// Assinaturas de arquivo (magic bytes). Confiar no `arquivo.type` do multipart
// e confiar no atacante: ele escolhe o valor. Aqui olhamos o conteudo.
function detectarMime(bytes: Uint8Array): string | null {
  const comeca = (assinatura: number[], offset = 0) =>
    assinatura.every((b, i) => bytes[offset + i] === b);

  if (comeca([0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (comeca([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca([0x52, 0x49, 0x46, 0x46]) && comeca([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";

  return null;
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Valida tamanho e conteudo real. Recebe os bytes ja lidos para nao ler o
// arquivo duas vezes.
export function validarArquivo(tamanhoBytes: number, conteudo: ArrayBuffer): ResultadoValidacao {
  if (tamanhoBytes <= 0) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
    const mb = Math.floor(TAMANHO_MAXIMO_BYTES / (1024 * 1024));
    return { ok: false, erro: `Arquivo acima do limite de ${mb} MB.` };
  }

  const mime = detectarMime(new Uint8Array(conteudo.slice(0, 16)));
  if (!mime || !(MIMES_PERMITIDOS as readonly string[]).includes(mime)) {
    return { ok: false, erro: "Formato nao aceito. Envie PDF, JPG, PNG ou WEBP." };
  }

  return { ok: true, mime, extensao: EXTENSAO_POR_MIME[mime] };
}

// Monta a chave do objeto sem nenhum byte vindo do cliente. Nao ha travessia
// possivel porque nao ha nome de arquivo na composicao.
export function montarChaveStorage(prefixo: string, extensao: string): string {
  return `${prefixo}/${crypto.randomUUID()}.${extensao}`;
}

// Sanitiza o nome original apenas para exibicao e para o Content-Disposition.
// Remove separadores de caminho, caracteres de controle e aspas.
export function sanitizarNomeExibicao(nome: string): string {
  const limpo = (nome || "documento")
    .replace(/[\\/]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"]/g, "")
    .trim();
  return limpo.slice(0, 120) || "documento";
}
