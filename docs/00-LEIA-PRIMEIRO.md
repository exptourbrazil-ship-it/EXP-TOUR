# 00 — LEIA PRIMEIRO · Handoff para o Claude Code
## Portal EXP Tour (e futura instância Forio) — pacote completo de arquitetura, especificações e ordem de execução
### Gerado em 21/08/2026, a partir da sessão de arquitetura com Rodrigo Collaro

---

## 1. O que é este pacote e como usá-lo

Este pacote contém toda a arquitetura do produto: Área do Cliente, Área Administrativa e Portal do Fornecedor, para duas instâncias autônomas (EXP Tour e Forio) sobre uma base de código.

**Contexto essencial**: já existe produto em produção. Leia o handoff técnico do repositório (`EXP Tour — Portal do Cliente (Handoff Técnico)`) antes de qualquer coisa: Next.js (App Router) + React + TS + Tailwind (tokens da marca), Supabase (Postgres + Storage), Vercel, Resend, Mercado Pago PIX. Login de cliente por CPF + código; admin por código de e-mail; parcelas com `valor_original` imutável; documentos com taxonomia em 3 categorias; regra dos 30 dias.

**Ordem de leitura dos documentos:**

| # | Documento | Papel |
|---|---|---|
| 01 | arquitetura-mestre-v4 | A visão completa: princípios, cenários de cliente (C1–C10), máquina de estados (0–8 + terminais), processos de exceção (E1–E11), catálogo de eventos, decisões tomadas |
| 02 | plano-desenvolvimento-v2 | **O plano de execução vigente**, mapeado sobre o stack real. Decisão-chave: Supabase é a fonte de verdade; Zoho é camada comercial futura |
| 03 | motor-area-do-cliente-v3 | Detalhe do checkout próprio, Termo de Adesão, fluxo Mercado Pago, réguas |
| 04 | motor-financeiro-parcelamento | Dívida na moeda do programa, editor de parcelas com Marcos 1 e 2, repactuação com aceite-aditivo, tesouraria cambial |
| 05 | modulo-fornecedores-v2 | Conferência automatizada de uploads, pagamento a escolas (D-30 configurável), ficha de matrícula bilíngue auto-preenchida |
| 06 | portal-fornecedor-especificacao-funcional | Portal do fornecedor: login por código de e-mail, matriz de alertas, materiais, catálogo, disponibilidade, modelo de dados |
| 07 | arquitetura-area-administrativa | Admin: Fila do Dia, RBAC (4 papéis), Caso 360, padrão de mutação com audit |
| 08 | arquitetura-experiencia-area-cliente | UX da Área do Cliente: princípios, navegação (5 abas, Viagem adaptativa), serviços integrados, linguagem visual |
| 09 | auditoria-lacunas-automacao | O raciocínio por trás das exceções e prioridades (contexto, não tarefas novas) |
| 10 | briefing-contador-tributarista | **Não é tarefa de código.** Contexto do handler de NFS-e, que fica pronto e desligado até o contador devolver os parâmetros |

Onde houver conflito entre documentos, vale o de número menor nesta tabela (o 01 e o 02 são os consolidados finais). Histórico: versões anteriores (motor v2, fornecedores v1, plano v1, arquitetura v1) foram substituídas e não estão no pacote.

## 2. Adendo: módulos Leads e Clientes (especificado na sessão, ainda sem doc próprio)

**Leads** (tabelas `leads` + `lead_interacoes`):
- Captura: endpoint público autenticado por chave (webhook do site WordPress, Meta Lead Ads), registro manual rápido, import CSV (feiras). Campo `origem` obrigatório. Dedupe por e-mail/telefone/CPF: repetido acrescenta interação, não cria novo.
- Pipeline kanban: Novo → Em contato → Qualificado → Proposta enviada → (Ganho | Perdido). Follow-up com data; vencido entra na Fila do Dia do consultor dono. Perdido exige motivo de lista fechada (preço, adiou, concorrente, sem retorno) para alimentar reativação.
- Conversões automáticas: "Gerar proposta" abre o módulo Propostas pré-carregado; `payment.approved` da entrada move o lead para Ganho e cria o cliente. Ninguém arrasta cartão que evento real já move.

**Clientes**:
- Lista com busca única (nome, CPF, e-mail, escola) que também encontra leads: uma pessoa é achável em qualquer fase da vida dela.
- Clique no nome → **Caso 360** com 6 abas: Jornada, Financeiro, Documentos, Comunicação, Eventos, Ações.
- Regras de edição: dados cadastrais editam com audit (antes/depois); campos contratuais nunca (`valor_original` com cadeado); campos com processo editam pelo processo (data de início → E2; escopo → E3); overrides só Gestor com justificativa obrigatória. Gestão de acessos/papéis do caso (contratante, estudante, observador) na tela de edição.

## 3. Telas já desenhadas (mockups aprovados na sessão — implementar fiel a estas descrições)

Identidade: fundo creme #f5ead9, cartões brancos, verde #042f1b estrutural, dourado #c9a35e SOMENTE para "próxima ação"/"aguardando você"/atenção; Bellefair (serifada) em títulos e números de destaque; sans no corpo; vermelho apenas no admin, nunca na área do cliente; estados sempre ícone + cor + texto.

**Área do Cliente:**
1. **Home** (estrutura fixa): header verde com saudação + contagem regressiva grande em dourado + programa; régua da jornada de 8 pontos (concluídos dourado preenchido, atual pulsante com halo, futuros contorno) com legenda "etapa X de 8"; card PRÓXIMA AÇÃO (borda esquerda dourada, label pequena, título serifado, progresso quando aplicável, botão verde full-width); card "Estamos cuidando para você" (itens com previsão e chips "em andamento"/"✓ feito"); seção "Serviços para sua viagem" com 3 cartões (Comprar moeda, Assessoria de visto, Passagem aérea) + estados inteligentes ("✓ resolvida" quando o e-ticket está no cofre; "disponível após aprovação do visto" antes disso) + linha de transparência de parceria; BottomNav 5 abas: Início, Financeiro, Documentos (badge dourado de pendência), Viagem (adaptativa: checklist → durante → retorno), Ajuda.
2. **Editor de parcelas**: saldo em moeda do programa + estimativa R$; timeline com parcelas (pagas verdes, futuras contorno) e DOIS marcos como linhas tracejadas rotuladas (Marco 1 âmbar "cobertura da escola", Marco 2 coral "embarque"); barra de cobertura acumulada; linhas editáveis (valor na moeda + R$ estimado ao vivo + Dividir); dois cartões de validação independentes (Marco 1 e soma=saldo) verde/vermelho com mensagens explicativas ("até 07/09 você precisa ter pago ao menos CAD X, valor que garantimos à escola para a sua vaga"); rodapé com contador de repactuações restantes; botões Antecipar (mesmo peso) e Salvar.
3. **Confirmação de repactuação**: título + "seu saldo devedor não muda"; tabela antes→depois com só as linhas alteradas destacadas em âmbar (antigo riscado, seta, novo em negrito); nota da regra cambial (BACEN + IOF 3,5% + taxa 6,6%, cláusula 6.3, exemplo do dia); os 2 marcos verdes reafirmados; checkbox de aceite com texto jurídico (cláusula, "vale como aditivo", registro data/hora/IP); clique sem checkbox mostra hint (botão nunca desabilitado); estado de sucesso com nº de registro (#RP-AAAA-NNNN), data/hora, cláusula, próxima parcela, aviso do PDF por e-mail.

**Admin (mesma marca, densidade de ferramenta):**
4. **Fila do Dia** (home): topbar verde com navegação (Fila do Dia · Casos · Propostas · Financeiro · Fornecedores · Config) + badge "nome · papel"; 4 contadores com borda colorida onde dói; filtros por papel (Todas/Minhas/Operação/Financeiro/Vendas); lista de tarefas: exceções sempre no topo com fundo diferenciado e nota do que o motor já fez ("cobrança pausada automaticamente"), cada linha com ícone, título com cliente, meta (idade · SLA · dono), chip de estado (no prazo/SLA estourado/hoje/expira Xh) e botão Abrir; rodapé fixo escuro "Saúde do motor" (webhooks, e-mails, retries).
5. **Caso 360**: header verde com nome, nº do caso, programa, contratante, etapa + badge de exceção, resumo pago; banner de exceção com os caminhos do processo como botões (E1: Registrar contato / Iniciar troca de destino / Cancelamento por visto); 6 abas; aba Jornada = linha de estados com datas reais + painel "últimos eventos" (log legível com autor, incluindo ações do motor).
6. **Caso 360 · Documentos**: 3 cartões (Estudante / Escola / Financeiro) com linhas: ícone, nome, metadado, chip de status, ação inline "Analisar"; chips "↗ escola vê"/"↗ enviada"; lembretes automáticos ativos visíveis; bloco escuro "Controle de compartilhamento" (o que a escola vê, último download, + compartilhar com justificativa); botão publicar documento no cofre.
7. **Caso 360 · Financeiro**: banner quando cobrança pausada por exceção; 3 cards (dívida em moeda / pago com nota dos fatores / marcos com estado); tabela de parcelas (venc., moeda, R$ com fator usado, status, recibo) com futuras "⏸ suspensa (E1) · sem QR"; histórico (repactuações com link antes/depois, conciliações MP, pausas); ações hierarquizadas: Gerar QR manual (Gestor · justificar), Iniciar acerto (processo), Reenviar recibos.
8. **Análise de documentos**: split view (visualizador com zoom/rotação | painel "conferir contra o caso" com dados do cadastro e checagens automáticas: validade vs retorno+6m, menor pela data do embarque); Aprovar em destaque; devolver por motivos de lista fechada (Ilegível, Foto cortada, Vencido, Nome divergente, Documento errado) — o motivo vira a notificação ao cliente; contador "X de N" da fila.
9. **Financeiro (módulo)**: abas (Visão geral · A receber · Repactuações · A pagar escolas · Conciliação MP · NFS-e); cards A Receber do mês (com chips no prazo/régua/D+10) e Exposição cambial 60 dias por moeda (% convertido, vermelho onde travar); lista Pagamentos a escolas com "Executar" só com fatura conferida ✓, "Revisar" na divergente (com o delta), status "aguardando câmbio".
10. **Propostas**: funil em 4 cards (enviadas→abertas→QR→pagas com % e barras); lista com bolinha de temperatura, engajamento ("abriu 2× · QR 1×"), prazo, e ação certa por contexto (Ligar agora / Follow-up / Ver caso); botão + Nova proposta dourado.
11. **Clientes**: busca global; filtros (Ativos, Por etapa, Com exceção, Embarcam em 30d); lista com linha de grupo (G-07 com líder); painel lateral de edição com as regras da seção 2.
12. **Leads**: kanban 4 colunas; cartões com destino/interesse, chip de origem (Instagram Ads, Expo Santos, Site, Indicação), follow-up vencido em vermelho; "Gerar proposta ▸" no qualificado; cartão verde "virou cliente ✓ · movida automaticamente ao pagar".

## 4. Ordem de execução (resumo do plano v2 — pedir UM item por vez)

**Bloco 1 (começar aqui):**
1. Webhook Mercado Pago idempotente + tabela `events` (id MP como chave, payload, status, tentativas, retry, validação de assinatura, reprocesso manual) + `audit_log` + `admin_users` (login multiusuário por papel).
2. Infra: migrar Vercel para Pro (Hobby não permite uso comercial), backups Supabase, revisar RLS, URLs assinadas no Storage.
3. Régua de cobrança (Vercel Cron + Resend): D-7/D-2/D+1/D+5 com link de pagamento; D+10 cria task; cessa ao pagar.
4. Fila do Dia v1 (docs para análise + D+10) sobre a tabela `tasks`.

**Bloco 2:** checkout/proposta (estados 0–1) com Termo de Adesão registrado + QR 24h; job BACEN + fator do dia; módulos Propostas e Leads.
**Bloco 3:** Zoho Sign (contrato multi-signatário por idade) + ficha bilíngue; sincronização Zoho como consumidor de eventos; Caso 360 v1 + análise de documentos.
**Bloco 4:** abas Viagem adaptativa (checklist v1, durante, retorno com NPS→Google→indicação); Marco 1 completo no editor; arrependimento 7 dias + E1 mínimo; configurações versionadas; saúde do motor.
**Depois:** portal do fornecedor (Fases A→B→C da spec 06), acertos/exceções completas, cockpit avançado, NFS-e (ligar com parâmetros do contador), instância Forio.

**Padrões obrigatórios em todo código novo:** toda mutação por função nomeada única (valida papel → transação → grava evento → audit → enfileira notificação); nenhuma credencial no cliente; parâmetros de negócio (spread 6,6%, IOF 3,5%, buffers, SLAs) em config por instância, nunca hardcoded; `valor_original` intocável; não reintroduzir o banner de simular câmbio; RLS como defesa em profundidade.

## 5. CLAUDE.md sugerido (colar na raiz do repositório)

```markdown
# EXP Tour — Portal do Cliente

Leia /docs/00-LEIA-PRIMEIRO.md antes de qualquer tarefa. A arquitetura completa
está em /docs (01 a 10). O plano de execução vigente é /docs/02-plano-desenvolvimento-v2.md.

Regras invioláveis:
- Supabase é a única fonte de verdade. Toda mutação passa por função nomeada que
  valida papel, executa em transação, grava em `events` e `audit_log`.
- `valor_original` de parcela NUNCA é sobrescrito.
- Parâmetros de negócio vêm de config por instância (TENANT), nunca hardcoded.
- Dinheiro só muda de estado por webhook confirmado (idempotente), nunca por tela.
- Não reintroduzir o banner de "Simular/antecipar câmbio".
- Marca: creme #f5ead9, verde #042f1b, dourado #c9a35e (só para ação/atenção),
  Bellefair em títulos. Vermelho apenas no admin.
- Trabalhe um item numerado do plano por vez, com testes, e pare para revisão.
```
