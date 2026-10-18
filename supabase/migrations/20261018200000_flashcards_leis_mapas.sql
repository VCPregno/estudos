-- =============================================================================
-- Flashcards, Leis secas e Mapas: ajustes para as telas
-- =============================================================================

-- Card criado a partir de uma questão (evita duplicar e permite voltar à questão).
alter table public.flashcards
  add column if not exists questao_id uuid references public.questoes on delete set null;
create index if not exists flashcards_disciplina_idx on public.flashcards (user_id, disciplina_id);

-- Leis: ligação opcional com a disciplina e ordem de leitura.
alter table public.leis
  add column if not exists disciplina_id uuid references public.disciplinas on delete set null;
create index if not exists leis_user_idx on public.leis (user_id, created_at desc);
