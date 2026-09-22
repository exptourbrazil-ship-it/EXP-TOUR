-- Promocao por FAIXA de quantidade, isencao de taxa e semanas gratis.
--
-- A aba de promocoes oferecia seis tipos (percent_off, fixed_off, free_units,
-- waive_fee, free_product, override_price) e o motor implementava DOIS. Alem
-- disso a promocao so tinha quantidade MINIMA, entao nao dava para dizer "de 12
-- a 23 semanas" nem "material gratis ate 12 semanas" — e duas faixas de preco
-- promocional se sobrepunham na mesma cotacao.
--
-- Esta coluna fecha o intervalo. Com min + max, as faixas ficam mutuamente
-- exclusivas por construcao, sem depender de prioridade nem de empilhamento.
alter table promotion add column if not exists max_quantity int;

comment on column promotion.max_quantity is
  'Teto INCLUSIVO de quantidade. Com min_quantity, desenha a faixa em que a promocao vale.';
