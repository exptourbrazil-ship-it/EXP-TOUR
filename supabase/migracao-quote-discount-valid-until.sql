-- F5 (módulo Fornecedores): PRAZO DA PROMOÇÃO no orçamento. A linha de desconto da
-- cotação (quote_discount) passa a congelar `valid_until` = promotion.booking_until
-- no momento em que o item foi cotado — o orçamento mostra "Promoção X · válida até
-- dd/mm/aaaa" e esse prazo não muda se a promoção for editada depois (imutabilidade
-- da fotografia). Junto, o motor passa a propagar promotion_id (fecha o TODO antigo).
-- Aditiva e idempotente; linhas antigas ficam null (aparecem linha a linha, SEM
-- prazo). Aplicada em produção em 16/09/2026.
alter table if exists quote_discount add column if not exists valid_until date;
