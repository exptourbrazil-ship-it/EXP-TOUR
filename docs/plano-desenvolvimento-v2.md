# Plano de desenvolvimento v2 — alinhado ao que já está em produção
## Portal EXP Tour (Next.js + Supabase + Vercel + Resend + Mercado Pago) × Arquitetura-Mestre v4

Substitui o plano de início anterior, que assumia backend a construir do zero. A realidade é melhor: portal em produção com login de cliente (CPF + código) e admin, parcelas com ajuste/antecipação/pagamento PIX, sistema de documentos com taxonomia, contagem regressiva e regras de negócio já implementadas. Este documento faz três coisas: (1) toma a decisão de arquitetura que o novo cenário impõe, (2) mapeia o que existe contra a arquitetura-mestre, (3) reordena o backlog.

---

## 1. A decisão que muda: Supabase é a fonte de verdade; o Zoho vira camada comercial

A arquitetura-mestre dizia "o CRM é a fonte de verdade". Isso fazia sentido quando o plano era construir sobre o stack Zoho. Mas o que existe hoje é um Postgres próprio (Supabase) com as tabelas operacionais reais (`titulares`, `parcelas`, `documentos`, `codigos_acesso`) e um portal funcionando em cima dele, enquanto o Zoho está inativo aguardando credenciais.

**Recomendação com convicção: inverta o papel.** O Supabase passa a ser a fonte de verdade operacional (jornada, parcelas, documentos, eventos), e o Zoho CRM entra como **camada comercial sincronizada** (pipeline de vendas, propostas, relacionamento), alimentada pelo barramento de eventos como mais um consumidor, junto com o Zoho Books para a parte contábil/fiscal quando o contador definir os parâmetros.

Por quê: o Postgres próprio dá controle total (transações atômicas, RLS, sem limite de API de terceiro no caminho crítico), o portal já vive nele, e o requisito original de "toda leitura server-side" já está satisfeito pelas API routes do Next.js. Reescrever o que funciona para servir a uma ferramenta que ainda nem está conectada seria inverter a hierarquia entre produto e ferramenta. O princípio da arquitetura permanece intacto: **uma única fonte de verdade, eventos movem tudo, o Zoho nunca vira uma segunda verdade** — sincronização é sempre unidirecional por domínio (vendas nascem no CRM e entram no Supabase uma vez, no ganho do deal; a operação vive no Supabase e espelha status no CRM para o time comercial enxergar).

Consequência prática imediata: **as credenciais do Zoho deixam de bloquear o caminho crítico.** `data_inicio` e recibos deixam de esperar o CRM; a integração Zoho vira um item de sincronização, não uma dependência.

## 2. Mapa: o que existe × arquitetura-mestre

| Arquitetura-mestre | Estado real | Leitura |
|---|---|---|
| Estados 4–6 (documentação, financeiro, pré-embarque parcial) | Portal com parcelas, documentos, contagem regressiva | O miolo da jornada existe |
| Login sem senha (filosofia magic link) | CPF + código por e-mail (cliente) e código por e-mail (admin) | Alinhado; melhor que senha |
| Marco de quitação antes do embarque | "Regra dos 30 dias" (última parcela ≥ D-30 do início) | Marco 2 implementado numa versão até mais conservadora (D-30, não D-0); falta só o Marco 1 (cobertura acumulada do valor da escola) quando houver dados de fornecedor |
| Repactuação preservando a dívida | Ajustar parcelas com `valor_original` intocável, restaurar plano com bloqueios, antecipação livre | Espírito do editor de parcelas já em produção; o wireframe aprovado vira evolução da UI existente |
| Cofre com taxonomia e direções (cliente envia / empresa publica) | Categorias estudante/escola/financeiro, upload só na seção Estudante | Exatamente a matriz de compartilhamento, versão 1 |
| Recibo por pagamento | Link de recibo + `paid_at` + "pago até agora" | Feito |
| Estados 0–1 (proposta + checkout com Termo de Adesão) | Não existe (titular criado pelo admin) | **Maior lacuna de receita** |
| Estado 2–3 (contrato Sign + ficha de matrícula assinada) | Não existe | Segunda maior lacuna |
| Barramento de eventos (idempotência, retry, log) | Não descrito; cobranças MP geridas por endpoints | **Verificar/robustecer o webhook do MP é prioridade zero** |
| Régua de cobrança e notificações proativas | Resend só envia códigos de acesso | Infra pronta (domínio verificado), falta o motor |
| Estados 6–8 (Embarque, Viagem, Retorno) | Abas desabilitadas | Planejado, ordem certa |
| Papéis por caso (contratante/estudante/observador) | Um titular por CPF | Evolução do modelo atual, não reescrita |
| Fornecedores, exceções E1–E10, cockpit, checklist por regras, NFS-e | Não iniciados | Conforme roadmap, sem mudança |

Duas observações de respeito ao que foi construído: a regra "valor_original nunca é sobrescrito" e o bloqueio de restaurar com parcela paga são exatamente as invariantes certas; e anotado o "não reintroduzir banner de simular/antecipar câmbio" — a antecipação permanece como ação disponível na parcela, sem banner promocional, e o plano respeita essa decisão de produto.

## 3. Backlog reordenado (a partir de hoje)

**Bloco 1 — Endurecer o que sustenta dinheiro (1–2 semanas)**
1. **Webhook Mercado Pago de produção com o padrão do barramento**: tabela `events` no Supabase (id do pagamento como chave de idempotência, payload, status, tentativas), handler que marca `paid_at`/status e nunca processa duplicata, validação de assinatura, reprocessamento manual. Se hoje a confirmação depende de retorno de tela ou consulta, este item é urgente: pagamento é a única parte do sistema que não pode depender de sorte.
2. **Infra à altura de produção com pagamento real**: Vercel Hobby não é licenciado para uso comercial e tem limites baixos; migrar o projeto para o plano Pro. Supabase: ativar backups (PITR se disponível no plano), revisar RLS das quatro tabelas e trocar downloads de documentos para URLs assinadas de curta duração, se ainda não for assim. LGPD do Storage: os documentos de estudante são dado sensível.
3. **Régua de cobrança sobre o Resend**: job diário (Vercel Cron) que varre `parcelas` e dispara D-7, D-2, D+1, D+5 com o QR/link de pagamento, cessando quando paga. Mata a cobrança manual e é o motor de notificações nascendo pequeno.

**Bloco 2 — Fechar o topo do funil (2–3 semanas)**
4. **Checkout/proposta (estados 0–1)**: admin (depois o CRM) cria a proposta → link único → página server-side com resumo do programa, formulário mínimo, **aceite do Termo de Adesão registrado (data/hora/IP/versão)** e QR PIX da entrada com expiração de 24h → webhook aprova → cria titular + parcelas + dispara boas-vindas com o código de acesso. Hoje o Termo/CDC dos 7 dias não existe no fluxo; este item é também a pendência jurídica número 1.
5. **Fator cambial do dia**: job da cotação BACEN (tabela `cotacoes`) e cálculo `valor_moeda × 1,035 × 1,066` na geração de cada cobrança, com a memória de cálculo no detalhe da parcela. (Se hoje as parcelas já nascem em R$ fixo, decidir com o jurídico se contratos vigentes migram ou só os novos.)

**Bloco 3 — Contrato e matrícula (2–3 semanas)**
6. **Assinatura eletrônica**: Zoho Sign conforme a arquitetura (as credenciais OAuth destravam Sign, CRM e Books de uma vez — vale resolver agora), com webhook no barramento; geração do contrato por merge com os dados do titular/programa; multi-signatário por idade. A ficha de matrícula bilíngue auto-preenchida entra na sequência, usando a taxonomia existente ("Ficha de Matrícula" já é um tipo).
7. **Sincronização Zoho como consumidor de eventos**: deal ganho no CRM → cria proposta no Supabase; status operacionais espelhados de volta. `data_inicio` passa a nascer da venda, mantendo a edição manual do admin como override.

**Bloco 4 — Completar a jornada visível (2 semanas)**
8. **Abas Embarque, Viagem e Retorno** (estados 6–8): checklist de embarque versão 1 (estática por destino antes do motor de regras), contatos/endereços na Viagem, e o Retorno com certificado no cofre + NPS + convite Google + indicação, que é o de melhor retorno por esforço.
9. **Marco 1 completo** no ajuste de parcelas quando o cadastro de fornecedor existir (valor da escola + prazo por fornecedor), evoluindo a regra dos 30 dias para os dois marcos do wireframe aprovado.
10. **Arrependimento de 7 dias e E1 mínimo (visto negado pausa cobrança)** — os dois primeiros processos de exceção, validando o padrão para os demais.

**Depois (conforme roadmap v4)**: papéis multiusuário, portal do fornecedor, motor de checklist por regras, cockpit, NFS-e (aguardando contador), parceiros ancilares, demais exceções.

## 4. Pequenas dívidas a registrar (não urgentes, não esquecer)

- Contas de admin individuais (o doc já prevê); trilha de auditoria de ações do admin (quem definiu `data_inicio`, quem inseriu documento) — barata agora, valiosa sempre.
- Limite de tentativas/expiração dos códigos de acesso já existe (`tentativas`, `expires_at`); confirmar rate-limit por IP nas rotas de request-code para evitar abuso do Resend.
- Padronizar os nomes de status de `parcelas` e `documentos` com o vocabulário da arquitetura-mestre (facilita o cockpit depois).
- O repositório está na organização `exptourbrazil-ship-it`: garantir acesso do Mauricio e 2FA na org.

## 5. Como seguir com o Claude

O handoff que você trouxe é exatamente o documento certo para o **Claude Code** trabalhar no repositório: colocá-lo em `/docs` junto com a arquitetura-mestre v4 e este plano, referenciados no CLAUDE.md. Pedir um item numerado por vez ("implemente o item 1: webhook MP idempotente com tabela events, conforme /docs"), com testes e commit a cada passo. O item 1 é o melhor primeiro pedido: pequeno, crítico e valida o padrão de eventos que tudo o mais vai usar.
