// Motor PURO de pendencias do Portal do Fornecedor (matriz 1-4 da doc 06).
// Sem rede/DB: recebe os contratos do fornecedor (com os documentos ja
// associados a cada um) e a data de hoje, e devolve as pendencias derivadas.
// Testado em fornecedor-pendencias.test.ts.
//
// As 4 pendencias da Fase A:
//   1. nova_matricula      — estudante vinculado ha poucos dias (revisar).
//   2. loa_pendente        — contrato sem Carta de Aceite (LOA) enviada.
//   3. documento_devolvido — doc que a escola enviou e foi rejeitado.
//   4. docs_viagem         — visto/passagem aprovados e compartilhados (baixar).

export type DocPendencia = {
  tipo: string; // tipo_documento
  origem: string | null; // 'zoho' | 'admin' | 'titular' | 'sistema' | 'fornecedor'
  status: string | null; // 'aprovado' | 'rejeitado' | 'pendente' | 'recebido' | null
  compartilhado: boolean;
};

export type ContratoPendencia = {
  contratoId: string;
  estudanteNome: string | null;
  canceladoEm: string | null;
  criadoEm: string | null; // ISO (a data da matricula/criacao do contrato)
  documentos: DocPendencia[];
};

export type TipoPendencia =
  | "nova_matricula"
  | "loa_pendente"
  | "documento_devolvido"
  | "docs_viagem";

export type Severidade = "info" | "atencao" | "urgente";

export type Pendencia = {
  tipo: TipoPendencia;
  contratoId: string;
  estudanteNome: string | null;
  titulo: string; // rotulo curto em PT
  idadeDias: number | null; // desde o gatilho (null quando nao ha data base)
  prazoDias: number | null; // prazo relativo ao gatilho (LOA), quando aplicavel
  severidade: Severidade;
};

export type ConfigPendencias = {
  loaPrazoDias: number; // vira 'urgente' a partir daqui (D+7)
  loaAvisoDias: number; // vira 'atencao' a partir daqui (D+3)
  novaMatriculaDias: number; // janela da "nova matricula" (7)
};

export const CONFIG_PENDENCIAS_PADRAO: ConfigPendencias = {
  loaPrazoDias: 7,
  loaAvisoDias: 3,
  novaMatriculaDias: 7,
};

// Tipos de documento que contam como "documentos de viagem" (pendencia 4).
export const TIPOS_DOC_VIAGEM = ["visto", "visto_2", "visto_eua", "eta", "passagem_aerea"];

// Diferenca em dias inteiros (>=0) entre uma data-base e hoje; null se sem base.
export function diasDesde(baseISO: string | null, hojeISO: string): number | null {
  if (!baseISO) return null;
  const base = Date.parse(baseISO.length <= 10 ? `${baseISO}T00:00:00Z` : baseISO);
  const hoje = Date.parse(hojeISO.length <= 10 ? `${hojeISO}T00:00:00Z` : hojeISO);
  if (Number.isNaN(base) || Number.isNaN(hoje)) return null;
  return Math.max(0, Math.floor((hoje - base) / 86_400_000));
}

function severidadeLoa(idade: number | null, cfg: ConfigPendencias): Severidade {
  if (idade == null) return "info";
  if (idade >= cfg.loaPrazoDias) return "urgente";
  if (idade >= cfg.loaAvisoDias) return "atencao";
  return "info";
}

// Deriva as pendencias de UM contrato (mais as de documento). Ordem estavel:
// documento_devolvido, loa_pendente, docs_viagem, nova_matricula.
function pendenciasDoContrato(
  c: ContratoPendencia,
  hojeISO: string,
  cfg: ConfigPendencias
): Pendencia[] {
  // Contrato cancelado nao gera pendencia operacional.
  if (c.canceladoEm) return [];

  const out: Pendencia[] = [];
  const nome = c.estudanteNome;

  // 3. Documento devolvido — um por documento rejeitado que a escola enviou.
  for (const d of c.documentos) {
    if (d.origem === "fornecedor" && d.status === "rejeitado") {
      out.push({
        tipo: "documento_devolvido",
        contratoId: c.contratoId,
        estudanteNome: nome,
        titulo: "Documento devolvido — corrigir e reenviar",
        idadeDias: null,
        prazoDias: null,
        severidade: "urgente",
      });
    }
  }

  // 2. LOA pendente — nenhum documento de Carta de Aceite (carta_aceite).
  const temLoa = c.documentos.some((d) => d.tipo === "carta_aceite");
  if (!temLoa) {
    const idade = diasDesde(c.criadoEm, hojeISO);
    out.push({
      tipo: "loa_pendente",
      contratoId: c.contratoId,
      estudanteNome: nome,
      titulo: "Enviar a Letter of Acceptance (LOA)",
      idadeDias: idade,
      prazoDias: cfg.loaPrazoDias,
      severidade: severidadeLoa(idade, cfg),
    });
  }

  // 4. Docs de viagem disponiveis — visto/passagem aprovados E compartilhados.
  const temViagem = c.documentos.some(
    (d) => TIPOS_DOC_VIAGEM.includes(d.tipo) && d.status === "aprovado" && d.compartilhado
  );
  if (temViagem) {
    out.push({
      tipo: "docs_viagem",
      contratoId: c.contratoId,
      estudanteNome: nome,
      titulo: "Documentos de viagem disponíveis para baixar",
      idadeDias: null,
      prazoDias: null,
      severidade: "info",
    });
  }

  // 1. Nova matricula — contrato vinculado ha poucos dias (janela de revisao).
  const idadeMatricula = diasDesde(c.criadoEm, hojeISO);
  if (idadeMatricula != null && idadeMatricula <= cfg.novaMatriculaDias) {
    out.push({
      tipo: "nova_matricula",
      contratoId: c.contratoId,
      estudanteNome: nome,
      titulo: "Novo estudante — revisar dados e documentos",
      idadeDias: idadeMatricula,
      prazoDias: null,
      severidade: "info",
    });
  }

  return out;
}

// Peso de ordenacao por severidade (urgente primeiro).
const PESO_SEV: Record<Severidade, number> = { urgente: 0, atencao: 1, info: 2 };

// Deriva TODAS as pendencias de um fornecedor, ja ordenadas: severidade
// (urgente -> info) e, dentro dela, mais antigas primeiro.
export function derivarPendencias(
  hojeISO: string,
  contratos: ContratoPendencia[],
  cfg: ConfigPendencias = CONFIG_PENDENCIAS_PADRAO
): Pendencia[] {
  const todas = contratos.flatMap((c) => pendenciasDoContrato(c, hojeISO, cfg));
  return todas.sort((a, b) => {
    if (PESO_SEV[a.severidade] !== PESO_SEV[b.severidade]) {
      return PESO_SEV[a.severidade] - PESO_SEV[b.severidade];
    }
    return (b.idadeDias ?? -1) - (a.idadeDias ?? -1);
  });
}

// Contadores por severidade (para o selo do Painel).
export function contarPorSeveridade(pendencias: Pendencia[]): Record<Severidade, number> {
  return pendencias.reduce(
    (acc, p) => {
      acc[p.severidade] += 1;
      return acc;
    },
    { urgente: 0, atencao: 0, info: 0 } as Record<Severidade, number>
  );
}
