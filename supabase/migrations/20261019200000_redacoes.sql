-- =============================================================================
-- Correção de redação e de questões discursivas
-- =============================================================================

create table if not exists public.redacoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  tipo         text not null default 'redacao' check (tipo in ('redacao', 'discursiva')),
  banca        text not null,
  tema         text not null,
  nota_maxima  numeric(6,2) not null check (nota_maxima > 0),
  nota_minima  numeric(6,2),
  linhas_min   smallint,
  linhas_max   smallint,
  criterios    text,                       -- régua usada (preset da banca ou colada do edital)
  imagens      text[] not null default '{}', -- fotos no bucket "mapas", pasta {uid}/redacoes/
  texto        text,                       -- transcrição da foto ou texto digitado
  correcao     jsonb,
  nota         numeric(6,2),
  provider     text,
  modelo       text,
  created_at   timestamptz not null default now()
);
create index if not exists redacoes_user_idx on public.redacoes (user_id, created_at desc);

alter table public.redacoes enable row level security;
drop policy if exists redacoes_dono on public.redacoes;
create policy redacoes_dono on public.redacoes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.redacoes to authenticated;
revoke all on public.redacoes from anon;
