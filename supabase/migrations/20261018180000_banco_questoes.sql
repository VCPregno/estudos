-- =============================================================================
-- Banco de questões: importação de provas em PDF pela IA
-- =============================================================================

alter table public.questoes
  add column if not exists edital_id          uuid references public.editais on delete set null,
  add column if not exists prova              text,      -- "FCC 2025, TRT-15, Analista Judiciário TI"
  add column if not exists numero             smallint,  -- número da questão no caderno
  add column if not exists texto_apoio        text,      -- texto compartilhado ("considere o texto abaixo")
  add column if not exists depende_de_imagem  boolean not null default false,
  add column if not exists gabarito_fonte     text not null default 'oficial'
                                              check (gabarito_fonte in ('oficial', 'ia', 'manual'));

create index if not exists questoes_topico_idx on public.questoes (user_id, topico_id);
create index if not exists questoes_prova_idx  on public.questoes (user_id, prova, numero);

-- Registro de cada leitura de prova pela IA (o resultado fica guardado mesmo
-- se a aba fechar antes da revisão).
create table if not exists public.prova_importacoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  edital_id      uuid references public.editais on delete set null,
  origem         jsonb not null default '{}'::jsonb,  -- caminhos no storage ou links dos PDFs
  paginas        text,
  provider       text,
  modelo         text,
  status         text not null default 'processando' check (status in ('processando', 'concluida', 'erro', 'gravada')),
  resultado      jsonb,
  erro           text,
  tokens_entrada integer,
  tokens_saida   integer,
  created_at     timestamptz not null default now()
);
create index if not exists prova_importacoes_user_idx on public.prova_importacoes (user_id, created_at desc);

alter table public.prova_importacoes enable row level security;
drop policy if exists prova_importacoes_dono on public.prova_importacoes;
create policy prova_importacoes_dono on public.prova_importacoes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.prova_importacoes to authenticated;

-- Resumo por questão para a tela de resolver: quantas vezes respondeu, se
-- acertou da última vez. security_invoker faz a view respeitar o RLS.
create or replace view public.v_questoes_status
with (security_invoker = true) as
select
  q.id as questao_id,
  q.user_id,
  count(r.id)                                   as tentativas,
  count(r.id) filter (where r.acertou)          as acertos,
  (array_agg(r.acertou order by r.respondida_em desc))[1]          as acertou_ultima,
  (array_agg(r.alternativa_marcada order by r.respondida_em desc))[1] as ultima_marcada,
  max(r.respondida_em)                          as ultima_em
from public.questoes q
left join public.respostas_questoes r on r.questao_id = q.id
group by q.id, q.user_id;

grant select on public.v_questoes_status to authenticated;

-- Visitantes anônimos não acessam nada (o padrão do Supabase daria acesso à anon).
revoke all on public.prova_importacoes, public.v_questoes_status from anon;
