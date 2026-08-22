# Portal do Fornecedor — Especificação funcional para desenvolvimento
## Login por código de e-mail, alertas automáticos, materiais, price list e disponibilidade
### Consolida e substitui a v3 no nível de implementação, sobre o stack existente (Next.js + Supabase + Resend)

---

## 1. Autenticação: e-mail + código, o mesmo mecanismo do cliente

Decisão confirmada: o fornecedor entra como o cliente entra. Informa o **e-mail cadastrado** → recebe código de 6 dígitos → acessa. Reuso direto do que já existe em produção:

- Generalizar o padrão da tabela `codigos_acesso` (ou criar `fornecedor_codigos` espelhada): código, expiração 10 min, tentativas, `used_at`.
- Sessão em cookie HMAC próprio (`exp_tour_fornecedor`, 12h), middleware protegendo `/fornecedor/*`, mesmo desenho do admin.
- Só e-mails presentes e ativos em `fornecedor_usuarios` recebem código. E-mail não cadastrado recebe resposta neutra ("se este e-mail estiver cadastrado, o código foi enviado"), sem revelar existência.
- Rate-limit por e-mail e por IP nas rotas de request (proteção do Resend e anti-enumeração).
- Interface bilíngue: campo `idioma` do usuário define a língua do portal e dos e-mails (EN padrão, PT disponível).

## 2. Alertas por e-mail (a matriz completa)

Todo alerta segue o padrão: assunto direto, um parágrafo de contexto, **um botão de ação** que leva à tela certa do portal (após o login por código). Nunca anexo. Enviados via Resend, no idioma do usuário, com log de entrega.

| Evento | Quando | Destinatário | Ação do botão |
|---|---|---|---|
| Nova matrícula | Ficha assinada compartilhada | Usuários com flag "admissions" | "Ver estudante e documentos" |
| LOA pendente | D+3 e D+7 sem upload | Admissions | "Enviar Letter of Acceptance" |
| Documento devolvido | Conferência apontou divergência confirmada | Quem fez o upload | "Corrigir e reenviar" |
| Docs de viagem disponíveis | Visto/passagem aprovados no cofre | Admissions | "Baixar documentos de viagem" |
| Pedido de confirmação | Adiamento (E2), alteração (E3) ou checagem de vaga | Admissions | "Confirmar disponibilidade" (aceitar/recusar na tela) |
| Pagamento enviado | Remessa executada (D-30) | Financeiro do fornecedor | "Ver comprovante" |
| Price list: aprovação | Gestor aprovou/pediu ajuste na publicação | Quem editou | "Ver catálogo publicado" |
| Convite de usuário | Admin do fornecedor convidou alguém | Convidado | "Criar meu acesso" |
| Resumo semanal | Segunda-feira, se houver atividade | Todos ativos | "Abrir meu painel" (pendências + feed da semana) |

Regra de cadência: pendência resolvida silencia o lembrete na hora; nada de alerta de coisa já feita. O resumo semanal agrupa o que não é urgente, mantendo o portal vivo sem virar spam.

## 3. Módulos do portal

### 3.1 Painel (home)
Pendências no topo (com idade e prazo) + feed de atividades dos casos do fornecedor. Conforme v3.

### 3.2 Estudantes
Lista com estágio e busca; caso 360 reduzido ao escopo (dados necessários do estudante, documentos compartilhados nas duas direções, linha do tempo). Upload tipado por caso com resultado da conferência automática na tela.

### 3.3 Materiais (novo)
Biblioteca de materiais promocionais e institucionais que o fornecedor mantém sozinho:
- Tipos: brochura, price list em PDF (referência humana; a estruturada vive no Catálogo), fotos, vídeos (link YouTube/Vimeo ou arquivo), apresentação, mídia kit, logotipo, termos/políticas da escola.
- Metadados: tipo, idioma, ano/validade, programa relacionado (opcional), permissão de uso ("uso interno do representante" vs "pode ser exposto ao cliente final").
- Consumo: os consultores acessam a biblioteca pelo admin (e o quote builder anexa a brochura certa à proposta automaticamente); materiais marcados como expostos ao cliente podem aparecer na Área do Cliente na página do programa. Material com validade vencida sai de circulação sozinho e gera pendência "atualizar material" ao fornecedor.
- Storage no Supabase com URLs assinadas; limite de tamanho por arquivo e varredura de tipo.

### 3.4 Catálogo: programas e preços
O fornecedor vê **exatamente o que está publicado** (programas, durações, preços por temporada, taxas, promoções com vigência) e edita em rascunho:
- Fluxo: rascunho do fornecedor → diff apresentado ao gestor → aprovação → publicado (versionado, com histórico de quem mudou o quê).
- Promoções com `valida_de`/`valida_ate` obrigatórios; expiram sozinhas.
- Moeda do catálogo = moeda do programa; o motor cambial cuida do resto.
- "Checar meus preços": visão de leitura do publicado, exportável em PDF, que responde sozinho o e-mail clássico "can you confirm our current prices in your system?".

### 3.5 Disponibilidade (novo, self-service imediato)
Diferente do preço, disponibilidade é dado operacional da escola e **publica na hora, sem aprovação** (com log e salvaguarda abaixo):
- **Por programa**: datas de início (calendário de intakes), status por data (aberto / poucas vagas / fechado / lista de espera), capacidade opcional.
- **Por acomodação**: tipo (homestay, residência, apartamento), disponibilidade por período (aberto/fechado/sob consulta), observações (ex.: "residência lotada em julho").
- Efeito imediato no quote builder: data fechada não é vendável; "poucas vagas" exibe alerta ao consultor; acomodação fechada oferece alternativa.
- **Salvaguarda**: mudança que afeta proposta aberta ou caso em andamento (ex.: fechou uma data com proposta enviada usando-a) gera alerta automático ao consultor dono e tarefa na Fila do Dia; nada quebra em silêncio.
- Pedido relâmpago: em alta temporada, o consultor pode disparar "confirmar disponibilidade" de dentro da proposta; o fornecedor responde com um clique pelo e-mail/portal, e a resposta fica registrada no caso.

### 3.6 Financeiro
Extrato de repasses por caso (bruto, comissão, líquido, previsão, status, comprovante). Conforme v3.

### 3.7 Perfil e usuários
Dados da instituição, gestão de usuários por convite (papéis: admin do fornecedor, admissions, financeiro, marketing — controlam quais alertas e telas cada um vê), preferências de notificação. Dado bancário com dupla confirmação + alerta ao gestor (antifraude, mantido da v3).

## 4. Modelo de dados (Supabase)

`fornecedores` (instituição, país, idioma padrão, SLA_LOA, prazo_pagamento, comissao, políticas de refund, dados bancários)
`fornecedor_usuarios` (fornecedor_id, e-mail, nome, papel, flags de alerta, idioma, ativo)
`fornecedor_codigos` (login por código, espelho de codigos_acesso)
`casos_fornecedor` (caso_id, fornecedor_id, status do mini-fluxo: ficha_enviada → LOA_aguardada → LOA_recebida → docs_viagem → encerrado)
`compartilhamentos` (documento_id, caso_id, fornecedor_id, direção, origem do gatilho, revogado_em)
`materiais` (fornecedor_id, tipo, idioma, validade, permissão de uso, arquivo/link)
`catalogo_programas`, `catalogo_precos` (por temporada), `promocoes` (com vigência), tudo com `status: rascunho|publicado` e versionamento
`disponibilidade_programas` (programa_id, data_inicio, status, capacidade), `acomodacoes` + `disponibilidade_acomodacoes`
`fornecedor_eventos` → gravados na tabela `events` geral (mesmo barramento), com `audit_log` para edições de catálogo/perfil

RLS estrita: toda query do portal filtra por `fornecedor_id` da sessão; documentos por `compartilhamentos` ativos; defesa em profundidade sobre o middleware.

## 5. Ordem de construção

1. **Fase A**: autenticação por código + painel (pendências/feed) + estudantes + upload com os alertas 1–4 da matriz. É o que elimina a dependência operacional do dia a dia.
2. **Fase B**: materiais + disponibilidade (+ alertas 5 e 9). Disponibilidade antes do catálogo de preços: é mais simples, não exige fluxo de aprovação e já elimina os e-mails de "is this date available?".
3. **Fase C**: catálogo de preços com aprovação + quote builder no admin + extrato financeiro (+ alertas 6–8). O mais valioso e o mais dependente dos outros módulos.

Piloto com 2–3 escolas de maior volume na Fase A; a promessa comercial que vende a adoção: "você vê tudo, recebe alertas do que importa e atualiza seus preços, materiais e vagas sem esperar ninguém".
