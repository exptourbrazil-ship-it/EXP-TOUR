# EXP-TOUR

Area do Cliente - Marketplace EXP Tour (projeto "Forio").

## Stack

Next.js 14 (App Router) com TypeScript, Tailwind CSS e Supabase (Postgres, Auth futuro e Storage). Pagamentos via API Pix do Mercado Pago (modalidade QR Code dinamico, que segundo o simulador de taxas da conta nao cobra tarifa, ao contrario da modalidade Link de pagamento que cobra 0,99%). Provisionamento de clientes via Zoho CRM (Contatos + Produtos).

## Prioridade atual

Primeiro a Area do Cliente com login por CPF e codigo via WhatsApp. Em seguida a aba de Parcelas, com listagem de parcelas, status pendente pago ou atrasado, e pagamento via Pix com QR code dinamico e atualizacao automatica de status via webhook do Mercado Pago. Depois disso, Documentos do participante e da agencia, incluindo o fluxo de assinatura Zoho Sign.

## Estrutura

A pasta `src/app` contem as paginas Next.js no formato App Router. A pasta `src/app/parcelas` contem a tela de parcelas do titular logado, incluindo o botao para gerar a cobranca Pix e exibir o QR code. A pasta `src/app/api/auth/request-code` contem o stub do envio de codigo por WhatsApp, que ainda precisa integrar um provedor real. A pasta `src/app/api/parcelas/[id]/gerar-cobranca` contem a rota que cria a cobranca Pix no Mercado Pago para uma parcela especifica. A pasta `src/app/api/webhooks/mercadopago` contem o endpoint que recebe as notificacoes do Mercado Pago e marca a parcela como paga automaticamente. A pasta `src/app/api/integrations/zoho/webhook` contem o endpoint que recebe o Workflow Webhook do Zoho CRM e cria/atualiza titular, contrato e parcelas no Supabase a partir de um Contato + Produto do Zoho. O arquivo `src/lib/mercadopago.ts` contem as funcoes de integracao com a API do Mercado Pago. O arquivo `src/lib/zoho.ts` contem as funcoes de integracao com a API do Zoho CRM (renovacao de access token via refresh token e busca de registros). O arquivo `src/lib/supabaseClient.ts` contem o cliente Supabase. O arquivo `supabase/schema.sql` contem o schema do banco, com as tabelas titulares, contratos e parcelas, ja aplicado no projeto Forio com os dados essenciais dos 11 titulares e contratos da planilha (nome, CPF, telefone e valores de parcelas, sem RG, endereco ou data de nascimento). As colunas `zoho_contact_id` (titulares) e `zoho_product_id` (contratos) foram adicionadas diretamente no projeto Forio via SQL Editor para permitir idempotencia na integracao com o Zoho.

## Configuracao local

Copie o arquivo `.env.example` para `.env.local` e preencha as chaves do Supabase, disponiveis em Project Settings e API Keys no projeto Forio, o `MERCADOPAGO_ACCESS_TOKEN` gerado em Suas integracoes e Credenciais no painel do Mercado Pago, e as credenciais do Zoho (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`) geradas no Zoho API Console (Self Client). Depois rode `npm install` e `npm run dev`.

## Configuracao do Mercado Pago

No painel do Mercado Pago, gere um Access Token de producao em Suas integracoes e Credenciais, e configure a URL de notificacoes (webhook) apontando para `/api/webhooks/mercadopago` no dominio onde o projeto estiver publicado. E importante usar a cobranca Pix via API (a mesma rota usada pelo QR Code dinamico) e nao o Checkout Pro ou Link de pagamento, para manter a taxa em 0% conforme o simulador da conta.

## Configuracao do Zoho CRM

O modulo Contatos tem os campos customizados `CPF` (texto) e `Produto Adquirido` (busca, aponta para o modulo Produtos). O modulo Produtos tem os campos customizados `Numero de Parcelas` (numero) e `Valor de Entrada` (moeda), alem do `Unit_Price` padrao para o valor total. Uma Workflow Rule no modulo Contatos (ao criar ou editar um registro) deve chamar um Webhook instantaneo do tipo POST para `https://<dominio>/api/integrations/zoho/webhook?contactId=${Contacts.Contact Id}`. O endpoint busca o Contato e o Produto vinculado via API do Zoho CRM (usando o Self Client OAuth) e cria o titular, o contrato e as parcelas (entrada + parcelas mensais no dia 15) no Supabase, evitando duplicar contratos ja criados para o mesmo titular e produto.

## Pendencias conhecidas

A autenticacao real por CPF e WhatsApp ainda e um stub. As policies de RLS das tabelas ainda precisam ser alinhadas ao fluxo de autenticacao customizado. O MERCADOPAGO_ACCESS_TOKEN ainda precisa ser gerado e configurado para os pagamentos funcionarem de ponta a ponta. A titular Isabela Coutinho Weber ainda nao tem contrato/parcelas importados pois a planilha nao tinha os valores definidos na epoca da importacao. A Workflow Rule + Webhook no Zoho CRM ainda precisa ser configurada apontando para o endpoint publicado. Os nomes de API dos campos customizados do Zoho (CPF, Produto_Adquirido, Numero_de_Parcelas, Valor_de_Entrada) foram assumidos pelo padrao do Zoho (rotulo com espacos virando underscore) e devem ser conferidos em Configuracao > Developer Space > APIs caso o webhook retorne erro ao ler esses campos. A moeda dos contratos criados via Zoho fica fixada em BRL, enquanto os contratos importados da planilha usam CAD; uma reconciliacao de moeda sera necessaria quando a precificacao real for definida. O app do WhatsApp Cloud API da Meta ainda precisa ser criado pela equipe EXP Tour (conta de desenvolvedor, verificacao de numero e aceite dos termos).
