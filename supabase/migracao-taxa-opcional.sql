-- Taxa opcional: a marca "obrigatoria" passa a valer no calculo.
--
-- `fee.is_mandatory` existia desde o inicio, e editavel nas telas do hub e era
-- gravada — mas o motor de preco NUNCA a lia: carregava todas as taxas
-- vinculadas ao produto e somava todas. Uma taxa marcada como opcional (um
-- transfer de aeroporto, por exemplo) entrava calada na conta de todo
-- estudante, com a tela dizendo o contrario.
--
-- Agora o servico separa: obrigatoria entra no preco; opcional volta em
-- `optionalFees` para a tela oferecer, e so entra quando o consultor escolhe.
-- `is_mandatory` NULO conta como obrigatoria — o padrao seguro e continuar
-- cobrando; taxa some da conta so quando alguem marcou como opcional.
--
-- A escolha do consultor fica gravada NO ITEM. Sem isso, o recalculo do
-- rascunho refaria o preco sem as opcionais e o price_breakdown (rastro
-- auditavel) passaria a divergir das linhas de taxa ja cobradas.
alter table quote_item add column if not exists optional_fee_ids uuid[];

comment on column quote_item.optional_fee_ids is
  'Taxas nao obrigatorias que o consultor incluiu neste item. Repassadas ao recalculo para o preco nao mudar sozinho.';
