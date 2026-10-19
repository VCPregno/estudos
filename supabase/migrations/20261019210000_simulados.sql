-- =============================================================================
-- Simulados cronometrados
-- =============================================================================

create table if not exists public.simulados (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  titulo       text not null,
  config       jsonb not null default '{}'::jsonb,   -- origem, limite de tempo, penalidade
  itens        jsonb not null default '[]'::jsonb,   -- [{questao_id, marcada, acertou, disciplina}]
  total        integer not null,
  acertos      integer not null,
  erros        integer not null,
  em_branco    integer not null,
  nota         numeric(6,2) not null,                -- 0 a 100
  duracao_seg  integer not null,
  created_at   timestamptz not null default now()
);
create index if not exists simulados_user_idx on public.simulados (user_id, created_at desc);

alter table public.simulados enable row level security;
drop policy if exists simulados_dono on public.simulados;
create policy simulados_dono on public.simulados for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.simulados to authenticated;
revoke all on public.simulados from anon;
