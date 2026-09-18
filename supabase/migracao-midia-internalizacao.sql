-- Internalizacao de midia do catalogo (carga da planilha 18/09/2026): as fotos de
-- campus_media e as capas de campus entraram como HOTLINK para o site das escolas.
-- O portal publico tem CSP `img-src` restrito a *.supabase.co, entao essas fotos
-- NAO renderizam ate serem copiadas para o Storage (bucket publico midia-catalogo).
-- O cron /api/cron/internalizar-midia baixa cada imagem, grava no bucket e troca
-- `url` pela URL publica do Storage, guardando a origem em `source_url`.
-- `internalize_attempts`/`internalize_error` limitam as tentativas (5) e deixam o
-- motivo visivel para o admin. Aplicada em producao em 2026-09-18 (MCP). Idempotente.
alter table if exists campus_media add column if not exists source_url text;
alter table if exists campus_media add column if not exists internalize_attempts int not null default 0;
alter table if exists campus_media add column if not exists internalize_error text;
create index if not exists idx_campus_media_tenant_campus on campus_media(tenant_id, campus_id);
-- Bucket publico onde as copias ficam (ja criado em prod em 18/09/2026; idempotente).
insert into storage.buckets (id, name, public) values ('midia-catalogo', 'midia-catalogo', true) on conflict (id) do nothing;
