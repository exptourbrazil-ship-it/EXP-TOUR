# Arquitetura da Área Administrativa — Portal EXP Tour / Forio
## O cockpit de gestão sobre o stack existente (Next.js + Supabase), evoluindo o /admin atual

O que existe hoje no /admin (login por código, definição de `data_inicio`, inserção de documentos) é a semente certa. Este documento desenha o destino: uma área administrativa que **trabalha por filas e exceções, não por navegação de registros**, onde toda ação vira evento auditado e o time nunca precisa de planilha paralela.

---

## 1. O princípio de design: o admin é operado pela fila, não pelo menu

O erro clássico de área administrativa é ser um espelho do banco: lista de clientes, lista de parcelas, lista de documentos, e o operador caçando o que precisa de atenção. O desenho certo inverte: **o sistema diz o que precisa de atenção**. A tela inicial é a Fila do Dia, gerada automaticamente pelos mesmos eventos e SLAs da arquitetura-mestre:

- Documentos aguardando análise (com idade e SLA declarado ao cliente)
- Parcelas em D+10 (cobrança humana) e repactuações que excederam o limite self-service
- Propostas expirando hoje / expiradas para retrabalho comercial
- LOAs de fornecedor em atraso contra o SLA (quando o módulo existir)
- Detratores de NPS aguardando contato em 24h
- Exceções abertas (visto negado, disputas MP, holds de verificação) com idade
- Falhas do motor (webhooks em retry, e-mails não entregues)

Cada item da fila tem dono, prazo e ação de um clique que abre o contexto já carregado. A lista de clientes continua existindo, mas como ferramenta de consulta, não como método de trabalho.

## 2. Papéis e permissões (RBAC), evoluindo o login atual

Hoje: código por e-mail para um destinatário fixo, credencial compartilhada. A evolução, sem trocar o mecanismo (que é bom):

**Tabela `admin_users`**: e-mail, nome, papel, ativo, criado_por. O fluxo de login atual passa a aceitar qualquer e-mail presente e ativo nessa tabela (em vez do destinatário fixo), mantendo o código de 6 dígitos e a sessão HMAC de 12h que já funcionam.

| Papel | Vê | Faz | Não faz |
|---|---|---|---|
| **Gestor** | Tudo, todas as instâncias de visão | Tudo + configurações + gestão de usuários + overrides (prazos, exceções, restaurar plano com pago mediante justificativa) | — |
| **Operação** | Casos, documentos, fornecedores, checklist | Analisa/aprova/rejeita documentos, publica docs de escola, atualiza visto, conduz exceções operacionais | Financeiro sensível, configurações |
| **Financeiro** | Parcelas, repactuações, contas a pagar, tesouraria, NFS-e | Cobrança D+10, acertos e reembolsos, execução de pagamento a fornecedor, disputas MP | Editar documentos de caso, configurações |
| **Consultor (vendas)** | Seus deals/propostas, casos dos seus clientes (leitura), funil próprio | Cria proposta/link de checkout, retrabalha expiradas, conversa de retenção em cancelamento | Ações de outros consultores, financeiro, configurações |

Regras transversais: papéis são por usuário e por instância (EXP Tour e Forio nunca se cruzam); **toda ação grava em `audit_log`** (quem, o quê, caso, antes/depois, timestamp, IP); ações destrutivas ou de override exigem campo de justificativa que vai para o log. O middleware atual de /admin/* ganha a checagem de papel por rota.

## 3. Módulos da área administrativa

### 3.1 Fila do Dia (home)
A seção 1. Implementada como tabela `tasks` populada por triggers/jobs (documento enviado cria task; D+10 cria task; SLA estourado cria task), com estado aberto/em andamento/concluído e dono. Contadores por categoria no topo; filtro "minhas tarefas".

### 3.2 Caso 360 (a tela mais importante depois da fila)
Tudo de um cliente numa página: cabeçalho (estudante, programa, escola, datas, estado da jornada, processo de exceção ativo se houver), e abas: **Jornada** (linha de estados com datas reais de cada transição), **Financeiro** (parcelas com histórico de repactuações e memória cambial), **Documentos** (as três categorias com ações de análise inline), **Comunicação** (todo e-mail/notificação enviada ao caso, com status de entrega), **Eventos** (o log bruto filtrado do caso: a resposta definitiva para "o que aconteceu aqui"), **Ações** (iniciar exceção, override com justificativa, reenviar acesso). O Caso 360 elimina o vaivém entre telas que consome o dia de operação.

### 3.3 Propostas e funil
Criar proposta (programa, valores em moeda, entrada, validade) → gera o link de checkout; lista com o funil enviada → aberta → QR → paga → expirada; retrabalho de expiradas com histórico de interação. Quando o Zoho CRM entrar como camada comercial, esta tela vira a ponte: deal ganho no CRM cria a proposta aqui.

### 3.4 Análise de documentos
Fila dedicada (além do atalho na Fila do Dia): visualizador do arquivo lado a lado com os dados do caso, aprovação em um clique, **rejeição sempre com motivo de lista fechada** (ilegível, cortado, vencido, nome divergente, documento errado) + campo livre opcional; o motivo vira a notificação acionável ao cliente. Quando a conferência automática de uploads de fornecedor existir, esta mesma tela mostra o diff da máquina.

### 3.5 Financeiro
Visões: parcelas a vencer/vencidas (com estágio da régua automática), inadimplência por faixa de atraso, repactuações do mês, acertos em andamento (cancelamentos/alterações com memória de cálculo), contas a pagar a fornecedor com o pacote D-45/D-37/D-30, e conciliação MP (pagamentos sem parcela casada, o alarme de bug). NFS-e entra aqui quando o contador devolver os parâmetros.

### 3.6 Fornecedores
Cadastro (contatos, idioma, modo de entrega, SLA de LOA, prazo de pagamento, comissão, políticas de refund), casos por fornecedor e estágio, pendências de LOA com idade, e futuramente o ranking (tempo médio de LOA, taxa de devolução).

### 3.7 Configurações (só Gestor)
Parâmetros da instância (spread, IOF, buffers dos marcos, limites de repactuação, SLAs), templates de e-mail/notificação com versionamento, templates jurídicos com vigência, regras de checklist (quando o motor existir), gestão de `admin_users`.

### 3.8 Auditoria e saúde
Visualizador do `audit_log` e da tabela `events` com filtros (caso, tipo, período, status), fila de retry com reprocessamento manual, e o painel de saúde: webhooks falhando, e-mails devolvidos, jobs atrasados. Falha crítica também notifica ativamente (e-mail ao gestor), porque painel que ninguém abre não é alerta.

## 4. Implementação sobre o stack atual

- **Tabelas novas**: `admin_users`, `tasks`, `audit_log`, `events` (a mesma do barramento; o admin é seu maior consumidor), `config` (parâmetros versionados), `propostas`. As existentes (`titulares`, `parcelas`, `documentos`) permanecem o núcleo.
- **Padrão de escrita**: toda mutação do admin passa por uma função server-side única por ação (`aprovarDocumento()`, `criarProposta()`, `executarAcerto()`) que valida papel → executa em transação → grava evento → grava audit → enfileira notificação. Nada de update direto de tabela espalhado pelas rotas: é isso que mantém o sistema auditável e o Zoho sincronizável depois.
- **UI**: as rotas /admin/* existentes evoluem; a Fila do Dia substitui a necessidade da "página inicial /admin com atalhos" que estava no pendente do handoff (atalho é menu; fila é trabalho).
- **RLS**: políticas do Supabase reforçando no banco o que o middleware garante na borda (defesa em profundidade, importante com documentos sensíveis no Storage).

## 5. Roadmap incremental (na sequência do plano de desenvolvimento v2)

1. **Junto com o Bloco 1** (webhook/eventos): tabelas `events`, `audit_log`, `admin_users` (login multiusuário com papel; contas individuais eram pendência do handoff) e a primeira Fila do Dia com duas fontes: documentos a analisar e parcelas D+10.
2. **Junto com o Bloco 2** (checkout): módulo Propostas com o funil.
3. **Junto com o Bloco 3** (contrato/Zoho): Caso 360 versão 1 (jornada + financeiro + documentos + eventos), tela de análise de documentos com motivos estruturados.
4. **Junto com o Bloco 4** (jornada completa): configurações versionadas, comunicação por caso, painel de saúde.
5. **Onda seguinte**: fornecedores, acertos/exceções guiadas, NFS-e, ranking e as visões analíticas do cockpit da arquitetura-mestre.

O critério de sucesso da área administrativa é um só, e vale medir: **ninguém do time abre planilha, WhatsApp Web ou o banco para responder "qual a situação deste cliente" ou "o que preciso fazer hoje"**. Quando essas duas perguntas forem respondidas pela Fila do Dia e pelo Caso 360, a gestão está resolvida.
