-- F3.2 (módulo Fornecedores): BROCHURA → proposta de CONTEÚDO pendente. Um material do
-- tipo 'brochura' (PDF ou imagem JPG/PNG/WEBP) entra na mesma fila de leitura por IA da
-- F3.1; a leitura extrai descrição/destaques/inclusões por programa e o bloco da escola,
-- casa cada seção com um produto existente do fornecedor (similaridade de nome) e cria
-- content_submission / campus_content_submission PENDENTES vinculadas ao material
-- (source_material_id). Só o admin publica (fluxo de aprovação existente).
-- Aditiva e idempotente. Aplicada em produção em 16/09/2026.
alter table if exists content_submission add column if not exists source_material_id uuid references material(id) on delete set null;
alter table if exists campus_content_submission add column if not exists source_material_id uuid references material(id) on delete set null;
create index if not exists idx_content_submission_source_material on content_submission(source_material_id);
create index if not exists idx_campus_content_submission_source_material on campus_content_submission(source_material_id);
-- Backfill: brochuras (PDF ou imagem) já subidas entram na fila; link/outros formatos = nao_suportado.
update material set leitura_status = 'pendente'
 where tipo = 'brochura' and archived_at is null and status <> 'rejeitado' and leitura_status = 'nao_aplicavel'
   and link_url is null and mime in ('application/pdf','image/jpeg','image/png','image/webp');
update material set leitura_status = 'nao_suportado'
 where tipo = 'brochura' and archived_at is null and leitura_status = 'nao_aplicavel'
   and (link_url is not null or mime is null or mime not in ('application/pdf','image/jpeg','image/png','image/webp'));
