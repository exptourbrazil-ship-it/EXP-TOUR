# Plano de implementação — Diagnóstico Forio

Plano de execução para o Claude Code, derivado do "Anexo I — Diagnóstico Forio"
(Notion, especificação do método, do instrumento e da operação). Este documento
traduz o método em itens de código, **um por vez, com testes e commit a cada
passo**, no padrão do [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md).

**Status:** decisões fechadas com Rodrigo em 26/09/2026 (Seção 0). Resta uma
pendência (plataforma do chat) que só bloqueia o item 2.2.

**Nomenclatura:** o assistente de IA da Forio chama-se **Chat da Forio**. O nome
"Altus" foi aposentado e substituído em todos os documentos, rótulos e
comentários em 26/09/2026. Não reintroduzir.

---

## 0. Decisões tomadas (26/09/2026)

| # | Decisão | Resultado |
|---|---|---|
| D1 | **Onde o diagnóstico roda.** | A conversa fica **dentro do Chat da Forio**. O portal é dono do motor, dos dados e do Plano, e expõe `/api/public/diagnostico/*` como ponte para o chat. A tela nativa `/diagnostico` existe como embutível e como reserva. **Pendente:** em que plataforma o Chat da Forio roda hoje (define se a ponte é tool calling, webhook ou iframe) — bloqueia só o item 2.2. |
| D2 | **Bloco A sem parceira.** | Não depender de escola parceira: a Forio constrói o **próprio instrumento de nivelamento** (item 2.1). Enquanto ele não existe, o cruzamento fica `nao_medido` e o plano marca o nível como estimativa. A ressalva do Anexo (3.3) continua valendo: instrumento interno sustenta acompanhamento individual, não campanha agregada. |
| D3 | **Plano Forio × cotação.** | Confirmado: **um único documento**. O chat apresenta **até três opções**; o Plano Forio é a aba "Seu plano" da cotação; o **Anexo III tem um só programa e um só preço**, o escolhido. |
| D4 | **Número de perguntas.** | Quanto menos, melhor. O que não pode cair é a **percepção de personalização**. Caminho mínimo de 5 perguntas; âncora só para situações que "acontecem hoje", máximo 4; devolutiva com valor antes do fim; o motor conta e corta em 12. |
| D5 | **IA para a camada de linguagem.** | Manter os recursos atuais (**Gemini gratuito**) por ora; Anthropic ou Gemini pago depois. Salvaguarda obrigatória: o texto enviado ao provedor é **pseudonimizado** (sem nome, e-mail, telefone, CPF, empresa), e a situação recente vai sem identificadores. Sem chave, template determinístico. |
| D6 | **Preço.** | Mais concreto que faixa: com destino e semanas conhecidos, o motor de cotação **calcula o número real** das opções recomendadas (curso + acomodação + taxas, câmbio do dia). A faixa derivada do catálogo (p25/mediana/p75) fica só para o escape de preço antes de saber destino e duração. |
| D7 | **Atributos de turma no catálogo.** | Confirmado. Perfil de turma, idade média, tamanho da turma, intensidade e nível mínimo entram em `product`/`campus` e são **extraídos do conteúdo das próprias escolas** (brochuras e sites já lidos pela esteira de material, F3.2) como propostas pendentes que o humano publica. |
| D8 | **Nível-alvo por situação.** | Ver Seção 6: é o degrau da Escada em que a pessoa executa aquela situação com autonomia. Proposta de valores para o núcleo comum na Seção 6, a revisar por Rodrigo junto com as âncoras. |

---

## 1. Premissas de arquitetura

1. **Supabase é a fonte de verdade.** Perfil, diagnóstico, restrições, plano e
   medições são linhas estruturadas; texto livre só na situação recente e nas
   devolutivas geradas.
2. **Determinístico vs. linguagem** (Seção 9.2 do Anexo). Cálculo de nível,
   lacuna, prioridade, alvo, compatibilidade meta × duração, faixa de preço e
   seleção de programas são funções **puras** em `src/lib/diagnostico*.ts`,
   testadas com `node --test`. O modelo de linguagem só escreve texto e nunca
   escolhe.
3. **Tudo salvo, sempre.** Cada resposta é gravada no momento em que chega
   (uma linha por resposta), não no fim. Abandono é lead com N campos.
4. **Instrumentação desde o item 1.** Cada pergunta apresentada/respondida vira
   evento; a taxa de conclusão por pergunta é relatório de admin, não análise
   posterior.
5. **Mesma disciplina do portal.** Rotas públicas com rate limit fechado, sem
   PII em log, posse checada em código, tenant isolado, mutação por função
   nomeada com `events` + `audit`.
6. **Vocabulário.** O cliente nunca vê CEFR nem "B1". A Escada Forio (1 a 5) é
   entidade de marca; o mapeamento CEFR é campo técnico interno.

---

## 2. Modelo de dados (migração `supabase/migracao-diagnostico.sql`)

Todas as tabelas com `tenant_id`, RLS habilitado sem policy, escrita via
service role. Nomes em snake_case, em português, como o resto do banco.

```
escada_nivel            -- 1..5: nome, descrição de trabalho, cefr_aprox (interno)
profissao               -- slug, nome, setor, ativo
situacao                -- slug, nome, nível_alvo (1..5), núcleo_comum bool, ativo
situacao_profissao      -- N:N (quais situações aparecem para qual profissão)
situacao_ancora         -- situacao_id, ordem, texto exibido, nível_mapeado numeric(2,1)

diagnostico             -- id, tenant_id, lead_id, titular_id (null até converter),
                        --   canal (chat|web|consultor), status (em_andamento|parcial|
                        --   concluido|abandonado), intencao_texto (Fase 0, literal),
                        --   profissao_id, contexto_empresa, nivel_autoavaliado numeric,
                        --   nivel_alvo int, padrao_cruzamento (alto_baixo|baixo_alto|
                        --   alinhado|nao_medido), situacao_recente_texto,
                        --   consentimento_conteudo bool, consentimento_em, perguntas_fechadas int,
                        --   versao_motor text, created_at, concluido_em, abandonado_em
diagnostico_resposta    -- diagnostico_id, pergunta_slug, ordem, valor jsonb,
                        --   nao_tenho_certeza bool, respondido_em   (uma linha por resposta)
diagnostico_situacao    -- diagnostico_id, situacao_id, frequencia (hoje|12m),
                        --   ancora_id (null = não perguntada), nivel_atual, lacuna,
                        --   prioridade, rank (1..3 = lacuna nomeada)
diagnostico_restricao   -- diagnostico_id, semanas_disponiveis, periodo_inicio, periodo_fim,
                        --   vinculo, orcamento_faixa, forma_pagamento, prazo_objetivo,
                        --   pagador, destino_desejado, destino_motivo, restricoes jsonb
diagnostico_plano       -- diagnostico_id, versao, quote_id (FK quote), status
                        --   (rascunho|revisado|enviado|expirado), texto_pontopartida,
                        --   texto_lacunas jsonb, texto_alvo, opcoes jsonb
                        --   [{product_id, justificativa, motivo_exclusao_alternativas}],
                        --   linha_tempo jsonb, criterio_sucesso, reteste_previsto,
                        --   revisado_por, revisado_em, divergencia_texto
medicao                 -- diagnostico_id, momento (T0|T1|T2|T3|placement_destino),
                        --   instrumento, escola_aplicadora, nivel_escada numeric,
                        --   cefr_bruto text, aplicado_em, evidencia_documento_id,
                        --   consentimento_compartilhar jsonb
faixa_preco             -- tenant_id, destino, semanas, p25, mediana, p75, moeda,
                        --   inclui text[], origem (derivado|manual), atualizado_em
evento_diagnostico      -- diagnostico_id, tipo (pergunta_exibida|respondida|pulada|
                        --   devolutiva_parcial|escape_preco|abandono|concluido), pergunta_slug, em
```

Alterações em tabelas existentes:

- `lead`: `origem` ganha `diagnostico`; coluna `diagnostico_id` (FK, set null).
  Dedupe por e-mail/telefone/CPF (documento 00, Seção 2, ainda não implementado):
  repetido acrescenta interação, não cria lead novo.
- `product` / `campus`: `perfil_turma` (geral|executivo|profissional|academico),
  `idade_minima`, `idade_media`, `tamanho_turma_max`, `intensidade_horas_semana`,
  `nivel_minimo_escada` (1..5). Nullable; `null` = desconhecido, e o motor trata
  desconhecido como "não recomenda para perfil executivo" (falha fechada).
- `quote`: `diagnostico_plano_id` (FK) para o portal e o PDF renderizarem a
  aba "Seu plano".
- `titulares`: nada. A conversão lead → titular já existe e passa a carregar o
  `diagnostico_id`.

---

## 3. Ordem de execução

Cada item é **um pedido ao Claude Code**. Critério de pronto: testes verdes,
`npm run build` com exit code 0, revisão de segurança, commit.

### M0 — fundação (sem UI, sem IA)

**0.1 Migração + seed da Escada e da biblioteca.**
Migração da Seção 2 (aplicar no SQL Editor e refletir em `schema.sql`). Seed
com os 5 níveis, o núcleo comum (8 situações), Tecnologia, Jurídico, Saúde,
Comercial e liderança, e as 3 situações com âncoras completas do Anexo (4.2).
Âncoras das demais situações: rascunho para revisão de Rodrigo (D8).
Teste: seed idempotente; toda situação tem 5 âncoras e nível-alvo.

**0.2 Motor puro `src/lib/diagnostico-motor.ts`.**
Funções: `nivelAtual(ancora)`, `lacuna(situacao, ancora)`,
`prioridade(lacuna, frequencia)` (peso 2/1/0), `lacunasNomeadas(lista)` (máx.
3, desempate por frequência e depois por ordem da biblioteca), `nivelAlvo(top3,
semanas)` com a **trava**: ≤ 4 semanas promete lacuna e não nível; salto de
nível inteiro exige ≥ 12 semanas; `nivelAutoavaliado(respostas)` (mediana
ponderada), `padraoCruzamento(t0, autoavaliado)` com limiar de 0,5 e
`nao_medido` quando não há T0, `contarPerguntas()` com corte em 12 fechadas +
1 aberta. Tudo puro, sem rede. Testes cobrindo os três padrões de cruzamento,
a trava de duração, o empate nas lacunas e o limite de perguntas.

**0.3 Roteiro da conversa `src/lib/diagnostico-roteiro.ts`.**
Máquina de estados das fases 0 a 7 do Anexo, com o **caminho mínimo** (objetivo,
janela, profissão, situações, uma âncora) e as camadas opcionais. Dado o estado
atual, devolve a próxima pergunta (slug, tipo, opções, "não tenho certeza"
sempre presente) ou a devolutiva. Regras de escape codificadas: pedido de preço
em qualquer ponto → faixa; pessoa decidida → encurta; abandono → salva.
Determinístico e testado: percorrer o caminho mínimo produz devolutiva em 5
perguntas; nunca passa de 12 fechadas.

**0.4 Serviço `src/lib/diagnostico-service.ts` (server-only).**
Mutações nomeadas: `iniciarDiagnostico`, `responder` (grava resposta +
evento, recalcula situações, avança roteiro), `marcarAbandono`,
`concluir` (lacunas, alvo, cruzamento, cria/atualiza lead com dedupe).
Cada mutação grava em `events` e `audit`. Sem UI ainda.

**0.5 Preço: faixa derivada + número real.**
Dois níveis. (a) `src/lib/faixa-preco.ts` (puro: percentis) + cron
`atualizar-faixa-preco` (diário, após o câmbio) que lê o catálogo precificável
e grava `faixa_preco` por destino × {2, 4, 8, 12} semanas com acomodação, na
moeda do destino e em BRL. Serve só ao **escape de preço** antes de destino e
duração serem conhecidos; cita p25–p75 com a mediana visível, nunca "a partir
de". (b) Assim que destino e semanas existem, a resposta de preço chama o
**motor de cotação real** (`orcamento.ts`) para as opções candidatas e devolve
o número exato com o que está incluído. O chat não calcula; consulta.

**0.6 Atributos de turma extraídos do material das escolas.**
Colunas novas em `product`/`campus` (Seção 2). Estender o leitor de brochura
(F3.2) e o de site para propor `perfil_turma`, `idade_media`,
`tamanho_turma_max`, `intensidade_horas_semana` e `nivel_minimo_escada` como
**propostas pendentes** na esteira de material; humano publica. Campo editável
no hub do fornecedor. Teste do extrator com fixture de brochura real.

### M1 — assistente nativo + plano revisado 100%

**1.1 Rota pública `/api/public/diagnostico/*`.**
`POST /iniciar` (cria sessão, devolve token opaco), `POST /[token]/responder`,
`GET /[token]/proxima`, `GET /[token]/devolutiva`, `POST /[token]/abandonar`.
Rate limit fechado por IP; token opaco de 32 bytes, expira em 7 dias; sem
PII no log. O mesmo contrato serve o Chat da Forio (D1) e a tela nativa.

**1.2 Tela `/diagnostico` (pública, lead-facing).**
Uma pergunta por vez, resposta em clique, contrato declarado na primeira
mensagem ("cinco perguntas rápidas…"), barra de progresso do caminho mínimo,
devolutiva parcial após a 3ª pergunta, devolutiva completa na fase 3, convite
ao nivelamento na fase 4 (desligado enquanto D2 não fechar), botão
permanente "quero só o preço". Marca Forio: creme, verde, dourado só para
próxima ação, sem vermelho. Mobile primeiro.

**1.3 Devolutiva parcial e completa (texto).**
Template determinístico em `src/lib/diagnostico-texto.ts` (nível estimado,
três lacunas em linguagem de trabalho, a frase-insight por padrão de
cruzamento). Camada de IA (D5) via `ia-extrator.ts` estendido com
`redigir()`, usando o provedor atual (Gemini) com **pseudonimização** da
entrada: função pura `pseudonimizar()` remove nome, e-mail, telefone, CPF e
empresa antes do envio, testada. Sem chave, template. O texto gerado nunca
contém número de preço nem nome de escola; esses vêm do motor.

**1.4 Motor de recomendação `src/lib/diagnostico-recomendacao.ts`.**
Filtro sobre o catálogo (D7): destino, semanas, perfil de turma pelo padrão
de cruzamento, nível mínimo, intensidade, faixa de orçamento, disponibilidade.
Devolve 2 (máx. 3) opções ranqueadas + os motivos de exclusão das
alternativas óbvias (para a justificativa). Puro sobre um snapshot do catálogo;
teste com fixtures garante que perfis diferentes recebem opções diferentes
(anti "teatro de diagnóstico").

**1.5 Plano Forio dentro da cotação.**
`concluir` cria uma `quote` em rascunho com as opções recomendadas (reusa
`lead-conversao-service` / construtor), grava `diagnostico_plano` versão 1 com
status `rascunho` e o vincula ao lead. Portal `/p/[token]` e PDF ganham a aba
"Seu plano" (ponto de partida, lacunas, alvo, programa + justificativa, linha
do tempo, investimento já existente, critério de sucesso e data do reteste).
Vocabulário travado (Cláusula 7.13.x) mantido.

**1.6 Admin: fila de revisão (M1 = Rodrigo revisa 100%).**
Em `/admin/leads/[id]` (Caso 360 do lead), painel "Diagnóstico": respostas,
lacunas, padrão, opções sugeridas e o texto. Ações: editar justificativa,
trocar opção, registrar **divergência** (obrigatória quando troca algo) e
"Enviar plano" (emite a cotação pelo fluxo existente). A lista de leads ganha
filtro "com diagnóstico" e status `plano_em_revisao`.

**1.7 Trilha de diagnóstico abandonado.**
Cron diário: diagnósticos `parcial` sem resposta há 24h → e-mail 1 com a
leitura parcial gratuita e link para retomar (token); 72h → e-mail 2; 7 dias →
`abandonado`. Idempotente por (diagnóstico, janela), como `lembretes_cobranca`.

**1.8 Instrumentação.**
Tela `/admin/diagnostico/metricas`: iniciados, conclusão do caminho mínimo,
taxa por pergunta e ponto de queda, escapes de preço, planos enviados. Alerta
interno se a conclusão do caminho mínimo ficar abaixo de 50% na semana.

### M2 — nivelamento próprio e ponte com o Chat da Forio

**2.1 Nivelamento Forio (instrumento próprio).** Em vez de depender de escola
parceira (D2). Três fatias:
- *2.1a Banco de itens.* Tabela `nivelamento_item` (habilidade: leitura,
  escuta, uso da língua; contexto de trabalho; nível 1..5; alternativas;
  gabarito; ativo). Itens redigidos como situações profissionais, não como
  gramática escolar, calibrados pelos descritores públicos do CEFR (mapeamento
  interno da Escada). Seed inicial de ~60 itens (12 por nível), revisado por
  Rodrigo; áudio de escuta gravado depois, item entra como texto até lá.
- *2.1b Motor adaptativo puro* (`src/lib/nivelamento-motor.ts`): começa no
  nível 3, sobe/desce por acerto, para em 12–15 itens ou quando estabiliza;
  devolve nível na Escada com margem. Mesmo instrumento nos três momentos:
  T1/T2 sorteiam itens ainda não vistos do mesmo banco (registro de itens
  aplicados por pessoa). Testado com sequências fixas.
- *2.1c Tela e registro.* `/nivelamento/[token]` (10 minutos, um item por
  vez), grava `medicao` T0 com `instrumento = forio_v1`, dispara o cruzamento
  A×B real e atualiza o plano. Convite da fase 4 é ligado por configuração do
  tenant quando 2.1 estiver em produção.
Validação honesta: nos primeiros 50 alunos, o placement da escola de destino
é comparado ao T0 (`medicao` momento `placement_destino`) e a divergência
média vira relatório de calibração. Enquanto não houver exame externo no T2,
nada de alegação pública agregada.

**2.2 Ponte com o Chat da Forio.** Conforme D1: chave por tenant, a plataforma
do chat chama as rotas de 1.1 e apresenta as perguntas e devolutivas na
conversa. O chat não calcula nada; consulta e cita. Registro do canal em
`diagnostico.canal`. **Bloqueado até saber a plataforma do chat** (define se
a ponte é tool calling, webhook ou a tela 1.2 embutida).

**2.3 Revisão por amostragem.** Configuração `diagnostico_amostragem_pct`;
planos fora da amostra saem sem revisão, com log de divergência dos revisados.

**2.4 Aprofundamento voluntário.** Após a devolutiva, oferta de completar
Bloco B (situações restantes) e Bloco C; e-mail pós-conclusão com o mesmo
convite. Perfil se completa em camadas.

### M3 — Resultado Forio e ciclo

**3.1 Resultado Forio.** Gerado automaticamente após T2: entrada × saída,
evolução por situação, placement de destino como corroboração, depoimento
(com consentimento) e recomendação de manutenção. Publicado no cofre da Área
do Cliente e por e-mail.

**3.2 Reteste T3 e recompra.** Régua de 6 meses após o retorno cria tarefa na
Fila do Dia e convite ao reteste.

**3.3 Envio sem revisão.** Só quando 2.3 mostrar divergência abaixo do limiar
acordado; o motor sinaliza casos para revisão humana (cruzamento `baixo_alto`,
orçamento fora da faixa, restrição de visto).

---

## 4. Riscos e mitigações no código

| Risco (Anexo, Seção 10) | Onde o código impede |
|---|---|
| Fricção | `contarPerguntas` corta em 12; devolutiva parcial na 3ª; escape de preço em toda pergunta |
| Promessa que não entrega | `nivelAlvo` com a trava de duração; texto usa "fechar lacunas" abaixo de 12 semanas |
| Medida frágil | `medicao.instrumento` obrigatório; `nao_medido` explícito; exame externo é um `momento` a mais |
| Privacidade | consentimento por finalidade em `medicao` e no `diagnostico`; IA gratuita bloqueada para texto pessoal (D5); nada de PII em log |
| Teatro de diagnóstico | teste de fixtures do 1.4 exige opções distintas para perfis distintos; admin registra divergência |

---

## 5. O que não está neste plano

- Redação final das âncoras, dos níveis-alvo e dos itens do nivelamento: dado,
  revisado por Rodrigo.
- Gravação dos áudios de escuta do nivelamento.
- Relatório anual público (9.4): depende de volume.
- Página pública "Quanto custa": consome `faixa_preco`, mas é item de site.
- Mês gratuito com escola brasileira: sem parceira, sai do caminho crítico.

---

## 6. Nível-alvo por situação (o que é e proposta inicial)

**O que é.** Cada situação da biblioteca tem um degrau da Escada Forio em que
a pessoa a executa **com autonomia**: o degrau da âncora "faço com
naturalidade". É propriedade da **situação**, não da pessoa. A lacuna é
`nível_alvo − nível_atual`, e a prioridade é a lacuna vezes o peso de
frequência. Sem o alvo, a fórmula do Anexo (4.4) não fecha; o documento define
a fórmula mas não os valores.

**Consequência prática.** Duas pessoas com o mesmo nível atual têm lacunas
diferentes se marcam situações diferentes: quem precisa "escrever e-mail" (alvo
3) e está no 3 não tem lacuna ali; quem precisa "discordar e defender posição"
(alvo 5) e está no 3 tem a maior lacuna do inventário. É isso que faz o plano
ser pessoal e não uma tabela de nível.

**Proposta para o núcleo comum** (a revisar com as âncoras):

| Situação | Alvo | Por quê |
|---|---|---|
| Escrever e-mail sem soar rude nem infantil | 3 | Escrita assíncrona, com tempo para revisar |
| Entender áudio rápido sem legenda | 3 | Recepção; não exige produção sob pressão |
| Conversa informal e relacionamento | 3 | Tolerância a erro alta, ritmo controlável |
| Reunião com time internacional | 4 | Tempo real, várias vozes, sem preparação |
| Call com várias pessoas e sotaques | 4 | Como acima, mais ruído de sotaque |
| Apresentar para audiência internacional | 4 | Produção longa + Q&A imprevisível |
| Entrevista de emprego internacional | 4 | Pressão, avaliação, perguntas abertas |
| Discordar e defender posição | 5 | Nuance, tom e autoridade sob tensão |

Regra de redação: o alvo de cada situação deve coincidir com o nível da 4ª ou
5ª âncora daquela situação. Nas três situações exemplificadas no Anexo isso
dá reunião = 4, negociar = 4 (âncora "negocio com naturalidade"; 5 é
influenciar), apresentar = 4. Situações das profissões (Tecnologia, Jurídico,
Saúde, Comercial) seguem o mesmo critério e são revisadas por Rodrigo no seed
do item 0.1.
