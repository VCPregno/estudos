-- =============================================================================
-- Onde estudar cada tópico: tipo de fonte e indicação, classificados pela IA
-- =============================================================================

alter table public.topicos_ementa
  add column if not exists tipo_fonte text check (tipo_fonte in ('norma', 'guia', 'classica', 'orgao')),
  add column if not exists fonte      text;

-- A view ganha as colunas novas no fim (create or replace exige manter a ordem).
create or replace view public.v_ementa
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.edital_id,
  t.disciplina_id,
  d.nome as disciplina,
  t.parent_id,
  t.codigo,
  t.titulo,
  t.ordem,
  t.minutos_estimados,
  t.minutos_estudados,
  t.teoria_concluida,
  t.teoria_concluida_em,
  coalesce(r.feitas, 0)        as revisoes_feitas,
  coalesce(r.total, 0)         as revisoes_total,
  r.proxima                    as proxima_revisao,
  coalesce(q.resolvidas, 0)    as questoes_resolvidas,
  coalesce(q.certas, 0)        as questoes_certas,
  case when coalesce(q.resolvidas, 0) > 0
       then round(100.0 * q.certas / q.resolvidas, 1) end as aproveitamento,
  t.tipo_fonte,
  t.fonte,
  coalesce(b.total, 0)         as questoes_banco
from public.topicos_ementa t
join public.disciplinas d on d.id = t.disciplina_id
left join lateral (
  select count(*) filter (where status = 'feita') as feitas,
         count(*) as total,
         min(data_alvo) filter (where status = 'pendente') as proxima
    from public.revisoes_programadas rp
   where rp.topico_id = t.id
) r on true
left join lateral (
  select count(*) as resolvidas, count(*) filter (where rq.acertou) as certas
    from public.respostas_questoes rq
    join public.questoes qq on qq.id = rq.questao_id
   where qq.topico_id = t.id
) q on true
left join lateral (
  select count(*) as total from public.questoes qb where qb.topico_id = t.id
) b on true;

-- Grava a classificação em lote. Roda com as permissões de quem chama: o RLS
-- garante que só os tópicos do próprio usuário mudam.
create or replace function public.definir_fontes(p_itens jsonb)
returns integer
language sql
as $$
  with x as (
    select * from jsonb_to_recordset(p_itens) as x(id uuid, tipo text, fonte text)
  ), u as (
    update public.topicos_ementa t
       set tipo_fonte = case when x.tipo in ('norma', 'guia', 'classica', 'orgao') then x.tipo end,
           fonte      = nullif(left(trim(x.fonte), 300), '')
      from x
     where t.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;

revoke execute on function public.definir_fontes(jsonb) from public, anon;
grant execute on function public.definir_fontes(jsonb) to authenticated;
