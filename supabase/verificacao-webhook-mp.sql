-- Verificacao de saude do webhook do Mercado Pago.
--
-- Rode no SQL Editor do Supabase DEPOIS de ajustar as credenciais no Vercel
-- (MERCADOPAGO_ACCESS_TOKEN + MERCADOPAGO_WEBHOOK_SECRET da MESMA aplicacao) e
-- de fazer o redeploy. Confirma que as notificacoes voltaram a ser aceitas.
--
-- Como ler o resultado (coluna "situacao"):
--   OK      -> tudo certo naquele item
--   ATENCAO -> precisa olhar (ver a coluna "detalhe")
--   INFO    -> so informativo, sem julgamento
--
-- Esperado com o webhook saudavel:
--   1) Assinaturas invalidas (24h) = 0   -> OK
--   3) Cobrancas com QR nao confirmadas = 0  (ninguem pagou sem o portal marcar)
--
-- Dica: apos usar "Simular notificacao" no painel do MP (evento Pagamentos),
-- rerode esta query. Deve aparecer um evento novo processado e NENHUMA
-- assinatura invalida nas ultimas 24h.

with mp as (
  select *
  from events
  where idempotency_key like 'mercadopago:%'
)
select verificacao, resultado, situacao, detalhe
from (
  -- 1) Assinaturas invalidas recentes: DEVE ser 0 depois do ajuste. Se > 0, o
  --    MERCADOPAGO_WEBHOOK_SECRET ainda nao bate com a aplicacao do access token.
  select
    1 as ordem,
    'Assinaturas invalidas (24h)' as verificacao,
    count(*)::text as resultado,
    case when count(*) = 0 then 'OK' else 'ATENCAO' end as situacao,
    coalesce('ultima em ' || max(created_at)::text, 'nenhuma nas ultimas 24h') as detalhe
  from mp
  where idempotency_key like 'mercadopago:assinatura-invalida:%'
    and created_at > now() - interval '24 hours'

  union all
  -- 2) Ultima notificacao processada com sucesso (pagamento confirmado pelo webhook).
  select
    2,
    'Ultimo pagamento processado',
    coalesce(max(processed_at)::text, 'nenhum'),
    case when max(processed_at) is not null then 'OK' else 'ATENCAO' end,
    coalesce(
      'evento: ' || (
        select idempotency_key from mp
        where status = 'processado'
        order by processed_at desc
        limit 1
      ),
      'nenhum evento processado ainda'
    )
  from mp
  where status = 'processado'

  union all
  -- 3) Pagamentos "presos": parcela com Pix gerado mas ainda nao marcada como paga.
  --    Se o cliente ja pagou e isto fica > 0, e sinal de webhook nao entregue.
  select
    3,
    'Cobrancas com QR nao confirmadas',
    count(*)::text,
    case when count(*) = 0 then 'OK' else 'ATENCAO' end,
    case when count(*) = 0
      then 'nenhuma cobranca pendente de confirmacao'
      else 'conferir se algum cliente pagou sem o portal marcar'
    end
  from parcelas
  where external_payment_id is not null
    and status <> 'pago'

  union all
  -- 4) Resumo geral do ledger de eventos do MP (contexto, sem julgamento).
  select
    4,
    'Ledger MP (processados / erros / total)',
    (count(*) filter (where status = 'processado'))::text || ' / ' ||
    (count(*) filter (where status = 'erro'))::text || ' / ' ||
    count(*)::text,
    'INFO',
    'ultimo evento em ' || coalesce(max(created_at)::text, '-')
  from mp
) t
order by ordem;
