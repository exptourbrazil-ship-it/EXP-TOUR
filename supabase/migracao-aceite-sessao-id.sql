-- Migracao: converter_cotacao passa a gravar aceites.sessao_id (Clausula 17.1).
-- Assinatura inalterada (24 params) -> CREATE OR REPLACE aplica sem drop.
-- Rodar no Supabase SQL Editor.

create or replace function converter_cotacao(
  p_quote_id uuid,
  p_tenant_id uuid,
  p_cpf text,
  p_nome text,
  p_email text,
  p_telefone text,
  p_contrato_nome text,
  p_valor_total numeric,
  p_moeda text,
  p_estudante_nome text,
  p_pais_destino text,
  p_data_inicio date,
  p_supplier_id uuid,
  p_parcelas jsonb,
  p_termo_id uuid,
  p_versao text,
  p_hash text,
  p_ip text,
  p_user_agent text,
  p_option_index int,
  p_anexo_iii jsonb default '[]'::jsonb,
  p_quadro_resumo jsonb default '{}'::jsonb,
  p_hash_quadro text default null,
  p_session_id text default null
) returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_tenant uuid;
  v_selected uuid;
  v_converted_contract uuid;
  v_valid_until date;
  v_token_revoked timestamptz;
  v_titular_id uuid;
  v_titular_tenant uuid;
  v_contrato_id uuid;
  v_sum numeric;
  v_neg int;
  v_item jsonb;
  v_reference text;
  v_fornecedor text;
  v_prazo text;
begin
  -- Trava a cotacao e le o estado sob lock (serializa conversoes concorrentes).
  select status, tenant_id, selected_option_id, converted_contract_id, valid_until, token_revoked_at, reference
    into v_status, v_tenant, v_selected, v_converted_contract, v_valid_until, v_token_revoked, v_reference
    from quote where id = p_quote_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'quote_nao_encontrada'; end if;

  -- Idempotente: ja convertida -> devolve o contrato existente, sem duplicar.
  if v_status = 'converted' then
    return jsonb_build_object('ja_convertida', true, 'contrato_id', v_converted_contract, 'titular_id', null);
  end if;
  if v_status <> 'option_selected' then raise exception 'nao_selecionada'; end if;
  if v_selected is null then raise exception 'sem_opcao'; end if;
  -- Link publico ainda valido: nao converte cotacao com token revogado nem vencida
  -- por data (a expiracao por data nao muda o status sozinha).
  if v_token_revoked is not null then raise exception 'token_revogado'; end if;
  if v_valid_until is not null and v_valid_until < current_date then raise exception 'cotacao_expirada'; end if;
  if p_valor_total <= 0 then raise exception 'valor_invalido'; end if;

  -- A soma do plano tem de bater com o valor do contrato (invariante de dinheiro)
  -- e nenhuma parcela pode ser negativa (defesa: soma pode fechar com negativos
  -- que se anulam).
  select coalesce(sum((x->>'valor')::numeric), 0),
         count(*) filter (where (x->>'valor')::numeric < 0)
    into v_sum, v_neg
    from jsonb_array_elements(p_parcelas) as x;
  if v_neg > 0 then raise exception 'plano_invalido'; end if;
  if round(v_sum, 2) <> round(p_valor_total, 2) then raise exception 'plano_invalido'; end if;

  -- Titular por CPF. Contato de titular JA existente fica INTOCADO (nem
  -- sobrescreve nem preenche em branco): o e-mail e o canal de login e o checkout
  -- e publico -> um CPF alheio nunca vincula um e-mail a uma conta existente. O
  -- do-update e um no-op (regrava o proprio cpf) so para o RETURNING funcionar.
  -- Contato so e definido quando o titular e CRIADO agora (CPF novo).
  insert into titulares (cpf, nome_completo, telefone, email, tenant_id)
  values (p_cpf, p_nome, p_telefone, p_email, v_tenant)
  on conflict (cpf) do update set cpf = excluded.cpf
  returning id, tenant_id into v_titular_id, v_titular_tenant;

  -- Guarda cross-tenant: um titular pre-existente de OUTRO tenant nao recebe o
  -- contrato desta cotacao (senao o programa/valor vazaria para o login daquele
  -- CPF no outro tenant). NULL = tenant padrao, nao conflita.
  if v_titular_tenant is not null and v_tenant is not null and v_titular_tenant <> v_tenant then
    raise exception 'titular_outro_tenant';
  end if;

  -- Contrato novo (na moeda de origem da opcao; conversao p/ BRL e por parcela).
  -- Congela o Quadro Resumo (snapshot IMUTAVEL) + hash + id de sessao do ato de
  -- marcacao (Clausula 17.1). O hash so e gravado junto de um snapshot presente
  -- (nunca hash orfao com quadro null).
  insert into contratos (titular_id, nome, valor_total, moeda, estudante_nome, pais_destino, data_inicio, supplier_id, quadro_resumo, hash_quadro, session_id)
  values (v_titular_id, p_contrato_nome, p_valor_total, coalesce(p_moeda, 'BRL'),
          p_estudante_nome, p_pais_destino, p_data_inicio, p_supplier_id,
          nullif(p_quadro_resumo, '{}'::jsonb),
          case when p_quadro_resumo is not null and p_quadro_resumo <> '{}'::jsonb then p_hash_quadro else null end,
          p_session_id)
  returning id into v_contrato_id;

  -- Parcelas (entrada + mensais) do plano ja validado.
  for v_item in select * from jsonb_array_elements(p_parcelas)
  loop
    insert into parcelas (contrato_id, numero, descricao, valor_original, valor_atual, vencimento, is_entrada, status)
    values (
      v_contrato_id,
      (v_item->>'numero')::int,
      coalesce(v_item->>'descricao', 'Parcela'),
      (v_item->>'valor')::numeric,
      (v_item->>'valor')::numeric,
      (v_item->>'vencimento')::date,
      coalesce((v_item->>'is_entrada')::boolean, false),
      'pendente'
    );
  end loop;

  -- Anexo III (Politica de Pagamento dos Fornecedores, Clausula 7.5.2): a cotacao
  -- aceita vira o CONTEUDO BASE. MULTI-ITEM: se o chamador enviou linhas
  -- (p_anexo_iii, uma por item da opcao), insere uma a uma; senao cai no item-base
  -- unico (compat + fallback). Os campos de POLITICA da escola (evento, documento,
  -- consequencia, cancelamento) ficam null p/ a equipe completar no /admin/anexo-iii.
  -- So na 1a conversao (a funcao retorna cedo quando ja convertida) -> nao duplica.
  if jsonb_array_length(coalesce(p_anexo_iii, '[]'::jsonb)) > 0 then
    for v_item in select * from jsonb_array_elements(p_anexo_iii)
    loop
      insert into anexo_iii_itens
        (contrato_id, fornecedor, natureza, valor, moeda, prazo,
         evento, documento_viabiliza, consequencia_atraso, politica_cancelamento, fonte, ordem)
      values (
        v_contrato_id,
        coalesce(nullif(v_item->>'fornecedor', ''), 'Fornecedor a confirmar'),
        v_item->>'natureza',
        (v_item->>'valor')::numeric,
        coalesce(nullif(v_item->>'moeda', ''), coalesce(p_moeda, 'BRL')),
        v_item->>'prazo',
        v_item->>'evento',
        v_item->>'documento_viabiliza',
        v_item->>'consequencia_atraso',
        v_item->>'politica_cancelamento',
        v_item->>'fonte',
        coalesce((v_item->>'ordem')::int, 0)
      );
    end loop;
  else
    v_fornecedor := coalesce(
      (select display_name from supplier where id = p_supplier_id and tenant_id = v_tenant),
      'Fornecedor a confirmar');
    v_prazo := case
      when p_data_inicio is not null
        then 'Ate ' || to_char(p_data_inicio - interval '30 days', 'DD/MM/YYYY') || ' (30 dias antes do inicio)'
      else '30 dias antes do inicio do programa'
    end;
    insert into anexo_iii_itens (contrato_id, fornecedor, natureza, valor, moeda, prazo, fonte, ordem)
    values (
      v_contrato_id, v_fornecedor, p_contrato_nome, p_valor_total, coalesce(p_moeda, 'BRL'), v_prazo,
      'Cotacao ' || coalesce(v_reference, p_quote_id::text), 0
    );
  end if;

  -- Prova imutavel do aceite (contexto 'checkout') = versao+hash do TEXTO do Termo.
  -- Idempotente pelo indice unico (titular, termo): duplo-clique/retry nao gera
  -- segunda prova. Registra tambem os elementos da marcacao eletronica da
  -- Clausula 17.1 disponiveis por-aceite: IP, user-agent e id de sessao (assim o
  -- proprio aceite e prova auto-suficiente). Por causa do dedup (titular, termo),
  -- esses metadados sao os do PRIMEIRO aceite daquele termo; o grao por-contrato
  -- do ato (hash do Quadro Resumo, id de sessao daquela assinatura) fica em
  -- `contratos`, que permanece a fonte autoritativa por contrato.
  insert into aceites (titular_id, termo_id, versao, hash_conteudo, contexto, ip, user_agent, sessao_id)
  values (v_titular_id, p_termo_id, p_versao, p_hash, 'checkout', p_ip, p_user_agent, p_session_id)
  on conflict (titular_id, termo_id) do nothing;

  -- Evento no barramento (auditoria/replay externo). Idempotente por cotacao.
  insert into events (source, event_type, idempotency_key, external_id, payload, status, processed_at)
  values ('portal_estudante', 'quote_converted', 'quote:converted:' || p_quote_id::text, p_quote_id::text,
          jsonb_build_object('contrato_id', v_contrato_id, 'titular_id', v_titular_id, 'option_index', p_option_index),
          'processado', now())
  on conflict (idempotency_key) do nothing;

  -- Telemetria da cotacao + trilha administrativa (autor = checkout do estudante).
  insert into quote_event (tenant_id, quote_id, kind, actor_type, metadata)
  values (v_tenant, p_quote_id, 'converted', 'student',
          jsonb_build_object('contrato_id', v_contrato_id, 'option_index', p_option_index));
  insert into admin_audit (usuario, acao, alvo, detalhe, ip)
  values ('checkout:estudante', 'quote.converted', p_quote_id::text,
          jsonb_build_object('contrato_id', v_contrato_id, 'titular_id', v_titular_id,
                             'valor_total', p_valor_total, 'moeda', p_moeda),
          p_ip);

  -- Marca a cotacao convertida (guarda de corrida: so a partir de option_selected).
  update quote
    set status = 'converted', converted_at = now(), converted_contract_id = v_contrato_id, updated_at = now()
    where id = p_quote_id and status = 'option_selected';

  return jsonb_build_object('ja_convertida', false, 'contrato_id', v_contrato_id,
                            'titular_id', v_titular_id, 'parcelas', jsonb_array_length(p_parcelas));
end;
$$;
