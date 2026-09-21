-- Formato da aula (program_detail.format): grupo / mini-grupo / individual /
-- combinado. Antes era texto livre e estava nulo em todas as 386 fichas, entao
-- a restricao entra sem backfill de compatibilidade.
--
-- Por que virou enum: o formato e dimensao de PRECO, nao descricao. A mesma
-- carga horaria custa ordens de grandeza diferentes conforme quantos alunos
-- dividem o professor (na Rennert, 2,4x no mesmo numero de aulas). Sem esse
-- campo nao da para ter "uma tabela de preco por numero de aulas" sem correr o
-- risco de juntar um curso em grupo com um individual que por acaso tem o mesmo
-- preco hoje.
--
-- `mini_group` existe porque o catalogo tem cursos "2:1" de verdade (The London
-- School of English), que nao sao nem grupo nem individual.
alter table program_detail drop constraint if exists program_detail_format_check;
alter table program_detail
  add constraint program_detail_format_check
  check (format in ('group','mini_group','one_to_one','combined'));

comment on column program_detail.format is
  'Formato da aula: group | mini_group | one_to_one | combined. Dimensao de preco.';
