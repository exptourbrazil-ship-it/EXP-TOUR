import crypto from "node:crypto";

// Hash dos codigos de acesso do cliente.
//
// Por que existe: `codigos_acesso.codigo` guardava o codigo de 6 digitos em
// texto claro, e nada nunca expurgava a tabela. Com o tempo isso vira um
// acervo crescente de credenciais de login legiveis — quem lesse a tabela
// (backup vazado, acesso indevido ao painel) entraria na conta de qualquer
// cliente que tivesse um codigo valido.
//
// O fluxo do admin ja fazia certo desde sempre (src/lib/admin-codigo.ts guarda
// HMAC do codigo, nunca o codigo). Aqui o cliente passa a seguir o mesmo
// padrao, com o mesmo segredo e o mesmo prefixo de dominio.

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET nao configurado.");
  }
  return secret;
}

// HMAC e nao hash simples: sem o segredo, quem tiver a tabela nao consegue
// montar uma rainbow table dos 900 mil codigos possiveis. Com SHA-256 puro,
// conseguiria em segundos.
export function hashCodigoAcesso(codigo: string): string {
  return crypto.createHmac("sha256", getSecret()).update("codigo:" + codigo).digest("hex");
}

// Gera um codigo de acesso de 6 digitos.
//
// crypto.randomInt, nao Math.random. O Math.random do V8 e xorshift128+, um
// PRNG nao criptografico cujo estado de 128 bits e recuperavel a partir de
// poucas saidas: quem pedisse codigos para o proprio CPF poderia prever os
// codigos emitidos para outros na mesma instancia serverless.
export function gerarCodigoAcesso(): string {
  return String(crypto.randomInt(100000, 1000000));
}

// Comparacao em tempo constante entre o codigo digitado e o hash guardado.
export function conferirCodigoAcesso(
  codigoDigitado: string,
  linha: { codigo_hash?: string | null; codigo?: string | null }
): boolean {
  const digitado = (codigoDigitado || "").trim();
  if (!digitado) return false;

  if (linha.codigo_hash) {
    const esperado = Buffer.from(linha.codigo_hash);
    const recebido = Buffer.from(hashCodigoAcesso(digitado));
    if (esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(esperado, recebido);
  }

  // Transicao: linhas gravadas antes deste commit ainda tem o codigo em claro.
  // Como o codigo expira em 10 minutos, este ramo deixa de ser exercitado
  // logo apos o deploy — ele existe apenas para nao derrubar quem estiver no
  // meio de um login. A coluna `codigo` pode ser removida depois.
  if (linha.codigo) {
    const esperado = Buffer.from(linha.codigo);
    const recebido = Buffer.from(digitado);
    if (esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(esperado, recebido);
  }

  return false;
}
