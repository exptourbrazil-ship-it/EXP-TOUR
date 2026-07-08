# EXP-TOUR

Area do Cliente - Marketplace EXP Tour (projeto "Forio").

## Stack

Next.js 14 (App Router) com TypeScript, Tailwind CSS e Supabase (Postgres, Auth futuro e Storage).

## Prioridade atual

Primeiro a Area do Cliente com login por CPF e codigo via WhatsApp. Em seguida a aba de Parcelas, com listagem de parcelas, status pendente pago ou atrasado, e pagamento via link ou QR code com atualizacao automatica de status via webhook do provedor de pagamento. Depois disso, Documentos do participante e da agencia, incluindo o fluxo de assinatura Zoho Sign.

## Estrutura

A pasta src/app contem as paginas Next.js no formato App Router. A pasta src/app/parcelas contem a tela de parcelas do titular logado. A pasta src/app/api/auth/request-code contem o stub do envio de codigo por WhatsApp, que ainda precisa integrar um provedor real. O arquivo src/lib/supabaseClient.ts contem o cliente Supabase. O arquivo supabase/schema.sql contem o schema inicial do banco, com as tabelas titulares, contratos e parcelas.

## Configuracao local

Copie o arquivo .env.example para .env.local e preencha as chaves do Supabase, disponiveis em Project Settings e API Keys no projeto Forio. Depois rode npm install e npm run dev.

## Pendencias conhecidas

A autenticacao real por CPF e WhatsApp ainda e um stub. O provedor de pagamento PIX com suporte a link, QR code e webhook ainda precisa ser escolhido. As policies de RLS das tabelas ainda precisam ser alinhadas ao fluxo de autenticacao customizado. E os dados reais de clientes e parcelas da planilha ainda precisam ser importados para o Supabase.
