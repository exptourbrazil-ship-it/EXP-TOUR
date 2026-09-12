-- Cotacao no formato Edvisor — aba "About Us" (institucional da agencia).
-- Texto institucional por tenant, exibido no portal publico da cotacao
-- (/p/[token]). Nullable: a aba tambem mostra os dados de contato do tenant
-- (nome/site/endereco/e-mail/telefone) que ja existem, entao funciona vazio.
alter table if exists tenant add column if not exists about_us_html text;
