-- Revisao de seguranca (14/10/2026): as funcoes do schema public eram executaveis
-- pela chave publica (anon) e por usuarios autenticados do Supabase via /rest/v1/rpc.
-- Hoje nao e explorável (rodam com os direitos de quem chama e o RLS nao tem policy),
-- mas a porta nao precisa existir. Toda chamada do app usa a service role, que mantem
-- o acesso. Tambem fixa o search_path das funcoes que ainda estavam mutaveis.

REVOKE EXECUTE ON FUNCTION public.anonimizar_titular(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_alteracao(uuid, text, numeric, numeric, numeric, date, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_cronograma_parcelas(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirmar_conta_bancaria_fornecedor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.converter_cotacao(uuid, uuid, text, text, text, text, text, numeric, text, text, text, date, uuid, jsonb, uuid, text, text, text, text, integer, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estornar_pagamento_manual(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.price_template_arquivar_expirada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.quote_note_somente_retratacao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_manual(uuid, uuid, numeric, numeric, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.substituir_elegibilidade(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.substituir_parcelas(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- search_path fixo (as 9 que o linter do Supabase apontou como mutaveis)
ALTER FUNCTION public.anonimizar_titular(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.aplicar_cronograma_parcelas(uuid, jsonb, numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirmar_conta_bancaria_fornecedor(uuid, uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.converter_cotacao(uuid, uuid, text, text, text, text, text, numeric, text, text, text, date, uuid, jsonb, uuid, text, text, text, text, integer, jsonb, jsonb, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.estornar_pagamento_manual(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.quote_note_somente_retratacao() SET search_path = public, pg_temp;
ALTER FUNCTION public.registrar_pagamento_manual(uuid, uuid, numeric, numeric, timestamp with time zone, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.substituir_elegibilidade(uuid, uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.substituir_parcelas(uuid, jsonb) SET search_path = public, pg_temp;

-- Funcoes criadas no futuro nao devem nascer executaveis pela chave publica.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
