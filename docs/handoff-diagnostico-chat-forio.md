# Handoff — Diagnóstico Forio no Chat da Forio

**Para:** Maurício (responsável pelo Chat da Forio, `www.forio.com.br/chat`).
**De:** Rodrigo Collaro, com apoio do Claude Code.
**Data:** 26 de setembro de 2026.
**Decisão:** o Diagnóstico Forio será implementado **dentro do Chat da Forio**,
no repositório do chat. O portal (Área do Cliente e admin, repositório
`EXP-TOUR`) entra como fornecedor de catálogo, preço e cotação, por API.

Este pacote tem três documentos. Leia nesta ordem:

| # | Documento | O que é |
|---|---|---|
| 1 | Este handoff | Contexto, decisões, divisão chat × portal, contrato de API, ordem sugerida e perguntas abertas |
| 2 | `plano-diagnostico-forio.md` | Plano completo: modelo de dados, itens de execução M0–M3, fórmulas do motor (Seção 7), cobertura de áreas (7.7) |
| 3 | `seed-diagnostico-forio.md` | Conteúdo aprovado por Rodrigo: Escada, 12 famílias, 56 situações com nível-alvo, 280 âncoras, textos das perguntas |

Fonte de tudo: **Anexo I — Diagnóstico Forio** (Notion), especificação do
método. Onde este pacote e o Anexo divergirem, vale o que está na Seção 2
abaixo, que registra decisões tomadas depois do Anexo.

---

## 1. Nomenclatura

O assistente chama-se **Chat da Forio**. O nome "Altus" foi aposentado em
26/09/2026 e já foi substituído em todos os documentos do portal, inclusive
no Termo de Adesão v2.1 (Cláusulas 1.e, 3.a.1, 4, 6.11.1 e 15.5). O chat hoje
se apresenta como "Assistente Forio"; precisa passar a dizer **Chat da Forio**.

---

## 2. Decisões tomadas (fecham o que o Anexo deixou aberto)

| # | Tema | Decisão |
|---|---|---|
| D1 | Onde roda | Conversa, roteiro, motor determinístico e devolutivas ficam **no chat**. Catálogo, preço, cotação, Plano dentro da cotação, Anexo III e revisão pelo consultor ficam **no portal**. |
| D2 | Nivelamento (Bloco A) | **Sem escola parceira.** A Forio constrói o próprio instrumento (banco de itens + motor adaptativo). Até existir, o cruzamento A×B fica `nao_medido` e o nível é estimativa declarada. |
| D3 | Plano × cotação | **Um documento só.** O chat apresenta **até 3 opções**. O Plano Forio é a aba "Seu plano" da cotação do portal. O **Anexo III sai com um programa e um preço**, com todas as condições daquele programa. |
| D4 | Perguntas | Quanto menos, melhor; o que não pode cair é a **percepção de personalização**. Caminho mínimo de 5 perguntas; âncora só para situações "acontece hoje", máximo 4; corte duro em 12 fechadas + 1 aberta. |
| D5 | IA de linguagem | Recursos atuais (Gemini gratuito) por ora. **Pseudonimizar** antes de enviar: sem nome, e-mail, telefone, CPF, empresa. Sem chave, template determinístico. A IA escreve; nunca escolhe escola nem calcula. |
| D6 | Preço | Faixa (p25 / mediana / p75, nunca "a partir de") **só para quem pede preço antes de concluir**. Com destino e semanas, o chat consulta o **motor de cotação real do portal** e cita o número exato. |
| D7 | Atributos de turma | Perfil de turma, idade média, tamanho, intensidade e nível mínimo entram no catálogo do portal, **extraídos do material das escolas** pela esteira de IA existente. Sem eles o motor "não discrimina". |
| D8 | Nível-alvo | Propriedade da **situação**: degrau em que a pessoa a executa com autonomia. Valores aprovados no seed. **Negociação é 5** em todas as variantes. |
| D9 | Áreas | 12 famílias profissionais + "Outra área" (núcleo comum + texto livre). Biblioteca cresce pelo dado: família com 10+ ocorrências no mês vira candidata. |

---

## 3. Divisão de responsabilidades

### 3.1 Chat da Forio (Maurício)

- Roteiro da conversa (fases 0–7 do Anexo, com caminho mínimo e escapes).
- Motor determinístico: nível estimado, lacunas, prioridade, alvo com trava
  de duração, cruzamento A×B. Fórmulas na Seção 7 do plano. **Puro e testado.**
- Persistência de cada resposta no momento em que chega (abandono = lead com
  N campos).
- Devolutiva parcial (após a 3ª pergunta) e completa (após as âncoras), com
  IA pseudonimizada ou template.
- Escape de preço: consulta faixa ou preço real no portal e cita.
- Apresentação de até 3 opções com justificativa por escrito.
- Handoff final: envia o diagnóstico estruturado ao portal, que cria lead e
  cotação em rascunho; agenda a call.
- Trilha de abandono (e-mail 24h com leitura parcial, 72h, 7 dias).
- Instrumentação por pergunta desde o dia 1 (PostHog já está no chat).
- M2: Nivelamento Forio próprio (banco de itens, motor adaptativo, tela).

### 3.2 Portal EXP-TOUR / Forio (Rodrigo, Claude Code)

- Atributos de turma no catálogo (D7) e extração pelo leitor de material.
- Faixa de preço derivada (cron diário) e endpoint de preço real.
- Endpoint que recebe o diagnóstico concluído e cria **lead + cotação em
  rascunho** com até 3 opções, guardando o diagnóstico estruturado.
- Aba "Seu plano" no portal da cotação e no PDF.
- Fila de revisão no admin (M1: Rodrigo revisa 100%, registra divergência).
- Anexo III com um programa e um preço.
- Resultado Forio (M3) e registro de medições.

### 3.3 Onde o dado mora

**Recomendação:** o chat guarda a conversa; o **diagnóstico estruturado mora
no Supabase do portal**, que é a fonte de verdade operacional e onde ele se
cruza com cotação, contrato, medições e Resultado Forio. O chat envia o
diagnóstico ao portal em dois momentos: **abandono** (parcial) e **conclusão**.
Sem isso, o "ativo que compõe" (Anexo, 9.4) fica em dois lugares.

Alternativa aceitável se o chat precisar de autonomia total: o chat persiste
e o portal sincroniza por evento. Unidirecional, sempre.

---

## 4. Contrato de API entre chat e portal (proposta)

Autenticação: `Authorization: Bearer <CHAT_API_KEY>` (variável do deploy do portal; Rodrigo entrega o valor ao Maurício por canal seguro). Sem a variável a rota recusa com 503; chave errada, 401; 120 chamadas por minuto por IP. Respostas sempre `{ ok, data }` ou `{ ok: false, error: { code, message } }`. Base: `https://<portal>/api/public/`.

| Rota | Direção | Para quê |
|---|---|---|
| `GET /api/public/preco/faixa?destino=&semanas=` | chat → portal | **Entregue (26/09).** Faixa p25/mediana/p75 na moeda e em BRL, amostra e o que inclui. `destino` aceita português ("Londres", "Inglaterra", "Malta"); sem destino devolve a faixa de cada país. `semanas` aproxima para 2, 4, 8 ou 12. Atualizada por cron diário depois do câmbio. |
| `POST /api/public/preco/opcoes` | chat → portal | **Entregue (26/09).** Corpo: `{ destino?, semanas, acomodacao?: homestay\|residence\|none, seguro?, orcamentoMaxBrl?, termo?, limite?: 1..3 }`. Saída: até 3 opções (uma por escola, mais barata primeiro) com linhas itemizadas, total na moeda e em BRL, links da escola e do programa, mais `excluidas` por motivo (fora da duração, acima do orçamento, fora do destino, sem câmbio, limite). Filtros de perfil de turma / nível / intensidade ainda não filtram (item 0.6) e voltam em `filtrosNaoSuportados`. |
| `POST /api/public/diagnostico` | chat → portal | Diagnóstico estruturado (modelo da Seção 2 do plano): perfil, respostas, situações com âncora e lacuna, restrições, status `parcial` ou `concluido`, opções escolhidas. Idempotente por `diagnostico_id` do chat. Cria ou atualiza lead (dedupe por e-mail/telefone) e, se concluído, cotação em rascunho. |
| `GET /api/public/diagnostico/[id]` | chat → portal | Retomada: o chat recupera o que já foi coletado para continuar a conversa. |
| `POST /api/public/nivelamento` | chat → portal | M2: grava medição T0/T1/T2 com instrumento e nível. |

O portal **não** chama o chat. O link de retomada é uma URL do chat com token
opaco, enviado nos e-mails da trilha de abandono.

---

## 5. Invariantes (valem nos dois lados)

1. **Determinístico decide, linguagem escreve.** Nível, lacuna, alvo, preço e
   escolha de escola nunca saem de um modelo de linguagem.
2. **Trava de duração.** Abaixo de 4 semanas não se promete nível; salto de
   um degrau exige 12 semanas ou mais (Seção 7.3 do plano).
3. **Escape de preço em qualquer pergunta.** Nunca recusar, nunca condicionar.
4. **"Não tenho certeza" é resposta válida em toda pergunta.** O plano sai
   com o campo marcado como estimativa.
5. **Tudo salvo, sempre.** Cada resposta é gravada ao chegar.
6. **Cliente nunca vê CEFR.** Só a Escada Forio.
7. **Vocabulário travado** (Cláusula 7.13.x): o plano sugerido não usa
   "parcela" nem "vencimento"; usa "sugestão".
8. **Pseudonimização** antes de qualquer chamada a IA.
9. **Consentimento explícito e registrado** para compartilhar evolução com
   escola ou empregador.

---

## 6. Ordem sugerida para o Maurício

| Etapa | Entrega | Depende do portal? |
|---|---|---|
| 1 | Motor puro com testes (Seção 7 do plano) + carga do seed como dados | Não |
| 2 | Roteiro do caminho mínimo (5 perguntas) + persistência por resposta | Não |
| 3 | Devolutiva parcial e completa (template; IA pseudonimizada depois) | Não |
| 4 | Escape de preço por faixa | Sim: `preco/faixa` |
| 5 | Opções com preço real e justificativa | Sim: `preco/opcoes` + atributos de turma |
| 6 | Envio do diagnóstico ao portal (abandono e conclusão) + link de retomada | Sim: `POST diagnostico` |
| 7 | Instrumentação por pergunta e painel de conclusão | Não |
| 8 | Trilha de e-mail de abandono | Não (e-mail do chat) |
| 9 | Aprofundamento voluntário (resto dos Blocos B e C) | Não |
| 10 | Nivelamento Forio próprio (M2) | Sim: `nivelamento` |

As etapas 1 a 3 podem começar hoje com o seed. O portal entrega as rotas das
etapas 4 a 6 em paralelo.

---

## 7. Perguntas para o Maurício

1. **Stack e persistência do chat.** Onde a conversa é guardada hoje
   (`/api/conversation?sessionId=`)? Banco próprio? Isso define a Seção 3.3.
2. **Modelo de linguagem em uso** e se o backend suporta **tool calling**.
   É o mecanismo previsto para o chat consultar preço e enviar o diagnóstico.
3. **Identidade do usuário.** Em que ponto o chat captura e-mail ou telefone?
   Sem isso não há trilha de abandono nem dedupe de lead.
4. **E-mail.** O chat envia e-mail hoje? Se não, a trilha de abandono pode
   ser disparada pelo portal a partir do diagnóstico parcial recebido.
5. **PostHog.** Quais eventos já existem? A instrumentação por pergunta pode
   reaproveitar.
6. **Os cinco passos atuais** ("Monte sua pergunta em 5 passos") viram a Fase
   0 do diagnóstico ou saem? Proposta: o passo 1 (objetivo) vira a pergunta
   de intenção; o resto é substituído pelo roteiro.
7. **Nome.** Troca de "Assistente Forio" para "Chat da Forio" na interface.
8. **Multi-tenant.** O chat serve só a Forio, ou também a EXP Tour? Define
   se a chave de API precisa de tenant.

---

## 8. O que o portal já tem e o chat pode contar

- Catálogo precificável: 22 escolas, ~250 cursos, ~270 acomodações, taxas,
  promoções, sazonalidade, câmbio diário com spread e IOF.
- Motor de cotação (`orcamento.ts`) com preço real por programa, semanas,
  mês de início, acomodação e seguro.
- Cotação com até N opções, portal público por token (abas Overview / Option /
  About / Notes), PDF, aceite, termo e Anexo III.
- Lead com funil (novo → em contato → cotação → convertido) e conversão em
  cliente.
- Esteira de material com leitura por IA (price list, brochura, promoção,
  disponibilidade), propostas pendentes e publicação humana.
- E-mail transacional (Resend) com log, crons diários, barramento de eventos
  idempotente.
