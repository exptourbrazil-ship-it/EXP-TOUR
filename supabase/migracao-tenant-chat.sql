-- Aba "Sobre nós" da cotação: link do chat "Chat da Forio" (botão). O WhatsApp reusa
-- tenant.contact_phone (renderizado como wa.me). Ver /admin/sobre-nos.
alter table if exists tenant add column if not exists chat_url text;
