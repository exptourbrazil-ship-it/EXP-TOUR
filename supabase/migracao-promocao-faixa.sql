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

-- Faixa de preco sobreposta nas unidades gratuitas. A VanWest da 4 semanas
-- gratis a quem contrata 24, mas cobra a semana "pela tarifa aplicavel ao
-- periodo de 12 a 23 semanas" — que e MAIS CARA que a faixa de 24. Sem esta
-- coluna o desconto sairia maior do que a escola concede.
alter table promotion add column if not exists free_units_tier_quantity int;

comment on column promotion.free_units_tier_quantity is
  'So para free_units: quantidade usada para escolher a faixa de preco, no lugar da contratada.';
