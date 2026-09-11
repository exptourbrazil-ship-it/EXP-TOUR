# Adequações da Área do Cliente ao contrato (gap analysis + plano)

Mapa entre os dois specs de arquitetura — **"Do contrato à operação"** e
**"Especificação de sistema: Anexo III, datas e cálculo de reembolso"** — e o que
existe hoje no código. Objetivo: cada cláusula que o contrato promete precisa ter
execução; cláusula sem execução é passivo.

Levantamento feito por varredura read-only do código (schema.sql, src/lib,
src/app). Legenda: **EXISTE** / **PARCIAL** / **FALTA**.

## 1. Quadro consolidado

### Estados, arrependimento e dedução (spec 1, seções 2, 7-A, 7-B)

| Requisito | Status | Gap |
|---|---|---|
| Máquina de 17 estados persistida + histórico de transições | **FALTA** | Estado é derivado ao vivo em `jornada.ts` (6 fases), sem coluna/tabela de estado nem trilha de transições. |
| `data_fim_arrependimento` gravado 1x no carimbo do envelope | **PARCIAL** | Prazo é recalculado em leitura a partir de `aceites.data_hora`; âncora frágil para contratos provisionados via CRM (comentário em `trava-remessa.ts`). Sem relógio "Entrada 5 dias". |
| Flag D+7 na CAMADA DE INTEGRAÇÃO, 4 funções | **PARCIAL** | Só a remessa financeira checa (`executarRepasse`). Compartilhar documento ao fornecedor **não checava** (fatia P0-1, em andamento). Submissão de matrícula e reserva de acomodação não existem como passos gateáveis. |
| Campo "processamento imediato" na ficha (não pré-marcado) | **EXISTE** | `ficha-matricula.ts` + `fichas_matricula.processamento_imediato`. |
| Texto "sem esta solicitação a restituição seria integral" | **FALTA** | Texto atual fala de remessa adiada, não da consequência de restituição. Sem `processamento_imediato_marcado_em`. |
| Dedução do RETIDO comprovado (não do remetido) + solicitação ao fornecedor no mesmo dia | **FALTA** | `refundEscola` é informacional/manual; sem distinção remetido/retido nem gatilho automático. |
| Certificado de auditoria (Envelope 1, hash), caixa de ciência do Anexo III, snapshot de políticas de site | **FALTA** | Não persistidos. |

### Anexo III, datas e reembolso (spec 2)

| Requisito | Status | Gap |
|---|---|---|
| `PoliticaRetencao` em escada por CAMPUS (âncora/unidade/degraus/teto c/ moeda/mínimo) | **FALTA** | Hoje: linha global `config_retencao` (só dias-até-início) + motor por etapa, desconectados; sem chave por campus, âncora múltipla, dias úteis/semanas/% horas. |
| Calendário de feriados por país (dias úteis) | **FALTA** | `campus_calendar_entry` existe mas é tabela morta; tudo em dias corridos. |
| Duas âncoras simultâneas por escola | **FALTA** | Motores não combináveis; sem "horas cumpridas". |
| Campos gravados na proposta (`quitacao_data_limite`, `entrada_vencimento`, `retencao_datas[]`, `reembolso_prazo_total`…) | **FALTA** | `dataLimiteQuitacao` é recalculado a cada leitura (regra só "início−30", sem "menor entre início-30 e prazo do fornecedor"). |
| Calculadora de reembolso unindo câmbio+fornecedor+Anexo III | **PARCIAL** | Motor existe (`reembolso-anexo-i.ts`): já tem teto 800, memória e SALDO DEVIDO. Falta: retenção por fornecedor (Anexo III), PTAX/IOF/5% na memória, degrau = max(estado,data), <30d→5%. |
| `intake_maximo_vendavel` (bloqueio) | **FALTA** | Só há erro colateral por falta de price_template. |
| Snapshot imutável do Anexo III + `politicas_referenciadas[]` | **FALTA** | `anexo_iii_itens` é editável livremente. Padrão de snapshot já existe no Quadro Resumo (reutilizável). |
| Fonte única (PTAX, IOF por vigência, teto, quitacao_data_limite) | **PARCIAL** | PTAX é fonte-única (cron BACEN). IOF/spread/teto vêm de env com fallback hardcoded; sem "por vigência". `repatriacao_dias_medios` não existe. |

### Área do Cliente: perfis, telas, vocabulário (spec 1, seção 3)

| Requisito | Status | Gap |
|---|---|---|
| 3 perfis (Contratante/Participante/Terceiro pagador) | **FALTA** | Só existe "titular" com acesso total; sessão e `titulares` sem campo de perfil. |
| Bloqueio financeiro do Participante (nunca ver saldo/valores) | **FALTA** | Nenhum enforcement; risco Cláusula 5.4.4 + LGPD. |
| Terceiro pagador (só comprovante do que pagou) | **FALTA** | Conceito inexistente (0 ocorrências de "pagador"). |
| Vocabulário travado (7.13.x) | **FALTA** | "Parcelas" (título/CTA), "Parcela 1/12", "Vencimento", "em atraso" visíveis ao cliente. Sem rótulo "sugestão". |
| Gerar cobrança com prévia antes de confirmar + validade 23h59 | **PARCIAL/FALTA** | Botão cria o Pix direto; breakdown só depois; sem expiração. |
| Saldo, Datas, Histórico/recibos, Documentos, Arrependimento (botão), Certificado+depoimento | **EXISTE** | — |
| Status do processo em tempo real (visto/carta em pipeline) | **PARCIAL** | Status binário (enviado/não), não multi-estágio. |
| Certificado de auditoria no Contrato | **PARCIAL** | Há hash/registro de aceite; não um certificado formal separado. |
| Suporte com Altus | **PARCIAL** | WhatsApp existe; "Altus" não existe no código. |

### Cancelamento, SLA, PDF, agentes (spec 1, seções 4, 7-C, 7-D, 7-E, 7-F)

| Requisito | Status | Gap |
|---|---|---|
| Cancelamento deliberado self-service (6 passos) | **FALTA** | Cancelar é ação de admin, desacoplada da calculadora; sem tela de consequências (7 itens) nem alternativas antes de confirmar. |
| Memória de reembolso com os 7 itens | **PARCIAL** | Faltam "Remuneração por Serviços", IOF+5% incidentes e "data em que a retenção aumenta". |
| Comunicações com prazo (SLA) automáticas + painel | **PARCIAL** | Fila de exceções cobre parte; faltam vários (restituição 48h, memória prelim/definitiva, 1º dia útil, provisionamento). Alertas de quitação 30/15/5 existem. |
| Calendário de dias úteis de São Paulo (18.6) | **FALTA** | Tudo em dias corridos. |
| Verificação de negrito no PDF (14 cláusulas) que falha o build | **FALTA** | Contrato-mestre é template no Zoho Sign, fora do repo; sem pipeline de PDF. |
| Agentes de retaguarda (camada detectiva 7-F) | **FALTA** | Só triggers pontuais (trava de remessa, conferência de fatura, pendências). |

## 2. Plano em fatias (priorizado)

Regra: fatia pequena, com teste do motor puro quando houver, revisão de segurança
nas sensíveis, build/test, PR. Uma fatia por vez.

### P0 — jurídico / dinheiro (fechar furos que viram passivo)

1. **Trava D+7 no compartilhar documentos** — gate na integração (reusa `avaliarTravaRemessa`). *(em andamento)*
2. **Vocabulário travado + rótulo "sugestão"** nas telas do cliente (7.13.x).
3. **Bloqueio financeiro do Participante** — perfil de acesso + enforcement (5.4.4 + LGPD).
4. **Texto do processamento imediato** correto (bilíngue) + `processamento_imediato_marcado_em`.
5. **Gerar cobrança**: prévia (cotação/5%/IOF/R$) antes de confirmar + expiração 23h59.

### P1 — estrutural (fonte de verdade e prova)

6. **Máquina de estados persistida** + histórico de transições.
7. **`data_fim_arrependimento` gravado** na assinatura (âncora do envelope), não recalculado.
8. **Snapshot imutável do Anexo III** (reusando padrão do Quadro Resumo) + `politicas_referenciadas[]`.
9. **Campos gravados na proposta** (`quitacao_data_limite` etc.), lidos em vez de recalculados.
10. **Calendário de dias úteis (SP + país da escola)**.

### P2 — arquitetura grande (projetos próprios)

11. **`PoliticaRetencao` em escada por campus** + reescrita da modelagem de retenção.
12. **Calculadora de reembolso unificada** (câmbio + fornecedor + Anexo III; degrau max(estado,data); <30d→5%; memória com 7 itens).
13. **Cancelamento deliberado self-service** (consequências + alternativas + confirmação nomeando o valor).
14. **SLA/comunicações com prazo** automatizadas + painel dedicado.
15. **Agentes de retaguarda** (camada detectiva 7-F).
16. **Verificação de negrito no PDF** — depende de trazer a geração do documento para o repo (mudança de arquitetura do Zoho Sign).

## 3. Observações

- Muitos requisitos P2 são **mudanças de modelagem** (retenção em escada, estados, reembolso unificado), não parametrizações — exigem DDL + migração de dados e devem ser fatiados com cuidado.
- O padrão de **snapshot imutável** (Quadro Resumo) e o de **motor puro testável** já existem no repo e devem ser reaproveitados nas fatias novas.
- A verificação de negrito (16) só é viável se o contrato final passar a ser gerado (ou baixado do Zoho e testado) dentro do CI.
