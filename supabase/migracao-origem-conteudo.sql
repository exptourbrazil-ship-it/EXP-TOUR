-- Origem do conteudo exibido nas cotacoes (product_content e campus_content).
--   fornecedor    : enviado pelo portal do fornecedor e aprovado pelo admin
--   admin         : editado direto no hub pelo admin
--   carga_interna : carga por planilha/SQL da EXP Tour (padrao das linhas antigas)
-- Ja aplicada em producao em 15/10/2026 (405 linhas de produto e 22 de escola ficaram
-- como carga_interna).
ALTER TABLE product_content ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'carga_interna' CHECK (origem IN ('fornecedor', 'admin', 'carga_interna'));
ALTER TABLE campus_content  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'carga_interna' CHECK (origem IN ('fornecedor', 'admin', 'carga_interna'));
