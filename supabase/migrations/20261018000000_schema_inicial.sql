-- =============================================================================
-- Plataforma de Estudos para Concursos — schema inicial
--
-- Uso pessoal, mas com Supabase Auth: toda linha pertence a um usuário
-- (user_id = auth.uid()) e o RLS garante que só o dono lê e escreve.
--
-- Convenções:
--   * Dias da semana: 0 = domingo ... 6 = sábado (igual ao JS getDay() e ao
--     extract(dow) do Postgres).
--   * "Dia de estudo" é calculado no fuso America/Sao_Paulo (app_today()).
--   * Minutos para planejamento; segundos para tempo medido pelo timer.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.app_date(ts timestamptz)
returns date
language sql
immutable
as $$
  select (ts at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Configurações do usuário
-- -----------------------------------------------------------------------------

create table public.configuracoes (
  user_id              uuid primary key default auth.uid() references auth.users on delete cascade,
  meta_diaria_min      integer not null default 120 check (meta_diaria_min between 0 and 1440),
  pomodoro_foco_min    integer not null default 25 check (pomodoro_foco_min between 5 and 180),
  pomodoro_pausa_min   integer not null default 5 check (pomodoro_pausa_min between 1 and 60),
  updated_at           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Editais, disciplinas e ementa
-- -----------------------------------------------------------------------------

create table public.editais (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  orgao         text,
  banca         text,
  cargo         text,
  carreira      text not null default 'geral' check (carreira in ('direito', 'ti', 'geral')),
  ano           smallint,
  data_prova    date,
  arquivo_path  text,                     -- caminho no bucket "editais"
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index editais_user_idx on public.editais (user_id, created_at desc);
create trigger editais_updated_at before update on public.editais
  for each row execute function public.set_updated_at();

-- Catálogo de disciplinas do usuário, compartilhado entre editais,
-- banco de questões, flashcards e mapas.
create table public.disciplinas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  nome        text not null,
  area        text not null default 'geral' check (area in ('direito', 'ti', 'geral')),
  cor         text,                       -- token de cor para a UI (ex.: "violet")
  created_at  timestamptz not null default now()
);
create unique index disciplinas_user_nome_uniq on public.disciplinas (user_id, lower(nome));

-- Quais disciplinas o edital cobra, com peso e nº de questões na prova.
create table public.edital_disciplinas (
  edital_id      uuid not null references public.editais on delete cascade,
  disciplina_id  uuid not null references public.disciplinas on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  peso           numeric(5,2),
  qtd_questoes   smallint,
  ordem          smallint not null default 0,
  primary key (edital_id, disciplina_id)
);

-- Ementa: tópicos (e subtópicos via parent_id) de cada disciplina do edital.
create table public.topicos_ementa (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users on delete cascade,
  edital_id            uuid not null references public.editais on delete cascade,
  disciplina_id        uuid not null references public.disciplinas on delete cascade,
  parent_id            uuid references public.topicos_ementa on delete cascade,
  codigo               text,               -- numeração do edital, ex.: "3.2"
  titulo               text not null,
  ordem                integer not null default 0,
  minutos_estimados    integer check (minutos_estimados > 0),  -- null = usa o bloco padrão do cronograma
  minutos_estudados    integer not null default 0,              -- alimentado pelas sessões de teoria
  teoria_concluida     boolean not null default false,
  teoria_concluida_em  date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index topicos_ementa_edital_idx on public.topicos_ementa (edital_id, disciplina_id, ordem);
create index topicos_ementa_parent_idx on public.topicos_ementa (parent_id);
create trigger topicos_ementa_updated_at before update on public.topicos_ementa
  for each row execute function public.set_updated_at();

-- Log de cada importação feita pela IA (permite revisar antes de gravar e
-- auditar custo/modelo usado).
create table public.edital_importacoes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  edital_id       uuid references public.editais on delete set null,
  arquivo_path    text,
  paginas         text,                   -- intervalo enviado à IA, ex.: "45-80"
  provider        text not null,          -- 'claude' | 'gemini'
  modelo          text not null,
  status          text not null default 'processando'
                  check (status in ('processando', 'concluida', 'erro', 'confirmada')),
  resultado       jsonb,
  erro            text,
  tokens_entrada  integer,
  tokens_saida    integer,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cronograma e Ciclo de Estudos
-- -----------------------------------------------------------------------------

create table public.cronogramas (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users on delete cascade,
  edital_id              uuid not null references public.editais on delete cascade,
  nome                   text not null,
  modo                   text not null default 'dinamico' check (modo in ('dinamico', 'fixo')),
  ativo                  boolean not null default true,
  data_inicio            date not null default public.app_today(),
  -- minutos disponíveis por dia da semana; chaves "0".."6" (0 = domingo)
  minutos_por_dia        jsonb not null default '{"0":0,"1":60,"2":60,"3":60,"4":60,"5":60,"6":60}',
  duracao_bloco_min      integer not null default 60 check (duracao_bloco_min between 10 and 480),
  fragmento_minimo_min   integer not null default 20 check (fragmento_minimo_min between 5 and 120),
  revisoes_habilitadas   boolean not null default true,
  revisoes_intervalos    integer[] not null default '{1,7,14,30,90}',
  revisoes_dias_semana   smallint[] not null default '{0,1,2,3,4,5,6}',
  minutos_por_revisao    integer not null default 15 check (minutos_por_revisao between 5 and 120),
  -- estado do ciclo dinâmico: em qual "turno" da sequência estou e quantos
  -- minutos desse turno já foram estudados (ver src/lib/ciclo)
  posicao_ciclo          integer not null default 0,
  minutos_no_turno       integer not null default 0,
  limite_revisao_pct     integer not null default 50 check (limite_revisao_pct between 10 and 100),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint revisoes_dias_validos check (revisoes_dias_semana <@ '{0,1,2,3,4,5,6}'::smallint[])
);
-- só um cronograma ativo por usuário
create unique index cronogramas_um_ativo on public.cronogramas (user_id) where ativo;
create trigger cronogramas_updated_at before update on public.cronogramas
  for each row execute function public.set_updated_at();

-- Ordem de prioridade (drag and drop do wizard) e peso de cada disciplina no ciclo.
create table public.cronograma_disciplinas (
  cronograma_id  uuid not null references public.cronogramas on delete cascade,
  disciplina_id  uuid not null references public.disciplinas on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  ordem          smallint not null,
  peso           smallint not null default 1 check (peso between 1 and 10), -- blocos por volta do ciclo
  ativo          boolean not null default true,
  primary key (cronograma_id, disciplina_id)
);

-- Revisões espaçadas (fila com data_alvo). Geradas automaticamente quando a
-- teoria de um tópico é concluída (ver trigger mais abaixo).
create table public.revisoes_programadas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  topico_id      uuid not null references public.topicos_ementa on delete cascade,
  disciplina_id  uuid not null references public.disciplinas on delete cascade,
  numero         smallint not null check (numero between 1 and 12),  -- 1ª, 2ª ... revisão
  intervalo_dias integer not null,
  data_base      date not null,           -- dia em que a teoria foi concluída
  data_alvo      date not null,
  status         text not null default 'pendente' check (status in ('pendente', 'feita', 'pulada')),
  feita_em       date,
  created_at     timestamptz not null default now(),
  unique (topico_id, numero)
);
create index revisoes_fila_idx on public.revisoes_programadas (user_id, status, data_alvo);

-- Plano materializado (o que aparece no calendário). No modo dinâmico os itens
-- pendentes futuros são regenerados a cada recálculo; no modo fixo ficam como
-- foram gerados e os vencidos aparecem como atrasados.
create table public.cronograma_itens (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  cronograma_id       uuid not null references public.cronogramas on delete cascade,
  data                date not null,
  ordem_no_dia        smallint not null default 0,
  tipo                text not null check (tipo in ('teoria', 'revisao')),
  disciplina_id       uuid not null references public.disciplinas on delete cascade,
  topico_id           uuid references public.topicos_ementa on delete cascade,
  revisao_id          uuid references public.revisoes_programadas on delete cascade,
  minutos_planejados  integer not null check (minutos_planejados > 0),
  minutos_realizados  integer not null default 0,
  status              text not null default 'pendente' check (status in ('pendente', 'concluido', 'pulado')),
  concluido_em        timestamptz,
  created_at          timestamptz not null default now()
);
create index cronograma_itens_data_idx on public.cronograma_itens (cronograma_id, data, ordem_no_dia);

-- -----------------------------------------------------------------------------
-- Sessões de estudo (timer) e progresso diário
-- -----------------------------------------------------------------------------

create table public.sessoes_estudo (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  cronograma_item_id  uuid references public.cronograma_itens on delete set null,
  disciplina_id       uuid references public.disciplinas on delete set null,
  topico_id           uuid references public.topicos_ementa on delete set null,
  tipo                text not null default 'teoria'
                      check (tipo in ('teoria', 'questoes', 'flashcards', 'revisao', 'lei_seca', 'livre')),
  inicio              timestamptz not null,
  fim                 timestamptz not null,
  segundos_liquidos   integer not null check (segundos_liquidos >= 0),  -- sem pausas
  pausas              smallint not null default 0,
  notas               text,
  created_at          timestamptz not null default now(),
  check (fim >= inicio)
);
create index sessoes_estudo_user_inicio_idx on public.sessoes_estudo (user_id, inicio desc);

create table public.progresso_diario (
  user_id               uuid not null default auth.uid() references auth.users on delete cascade,
  dia                   date not null,
  segundos_estudados    integer not null default 0,
  questoes_resolvidas   integer not null default 0,
  questoes_certas       integer not null default 0,
  flashcards_revisados  integer not null default 0,
  revisoes_feitas       integer not null default 0,
  primary key (user_id, dia)
);

-- -----------------------------------------------------------------------------
-- Banco de questões
-- -----------------------------------------------------------------------------

create table public.questoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  external_id    text,                    -- id da fonte, evita duplicar na importação
  carreira       text not null default 'geral' check (carreira in ('direito', 'ti', 'geral')),
  banca          text,
  orgao          text,
  cargo          text,
  ano            smallint,
  disciplina_id  uuid references public.disciplinas on delete set null,
  assunto        text,
  topico_id      uuid references public.topicos_ementa on delete set null,
  tipo           text not null default 'multipla_escolha' check (tipo in ('multipla_escolha', 'certo_errado')),
  enunciado      text not null,
  -- [{"letra":"A","texto":"..."}, ...]; vazio para certo/errado
  alternativas   jsonb not null default '[]'::jsonb,
  gabarito       text not null,           -- "A".."E" ou "C"/"E"
  comentario     text,
  anulada        boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, external_id)
);
create index questoes_filtros_idx on public.questoes (user_id, carreira, banca, disciplina_id, assunto);
create index questoes_busca_idx on public.questoes using gin (to_tsvector('portuguese', enunciado));

create table public.respostas_questoes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users on delete cascade,
  questao_id           uuid not null references public.questoes on delete cascade,
  alternativa_marcada  text not null,
  acertou              boolean not null,
  tempo_segundos       integer,
  respondida_em        timestamptz not null default now()
);
create index respostas_user_data_idx on public.respostas_questoes (user_id, respondida_em desc);
create index respostas_questao_idx on public.respostas_questoes (questao_id);

-- -----------------------------------------------------------------------------
-- Flashcards (repetição espaçada estilo Anki / SM-2 com etapas de aprendizado)
-- -----------------------------------------------------------------------------

create table public.flashcards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  external_id    text,
  disciplina_id  uuid references public.disciplinas on delete set null,
  topico_id      uuid references public.topicos_ementa on delete set null,
  frente         text not null,
  verso          text not null,
  tags           text[] not null default '{}',
  -- novo/aprendendo/reaprendendo = memória de curto prazo; revisao = longo prazo
  estado         text not null default 'novo' check (estado in ('novo', 'aprendendo', 'revisao', 'reaprendendo')),
  etapa          smallint not null default 0,          -- índice na lista de etapas de aprendizado
  vencimento     timestamptz not null default now(),
  intervalo_dias numeric(8,2) not null default 0,
  facilidade     numeric(4,2) not null default 2.50,   -- ease factor
  repeticoes     integer not null default 0,
  lapsos         integer not null default 0,
  ultima_revisao timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, external_id)
);
create index flashcards_fila_idx on public.flashcards (user_id, vencimento);

create table public.flashcard_revisoes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users on delete cascade,
  flashcard_id         uuid not null references public.flashcards on delete cascade,
  nota                 smallint not null check (nota between 1 and 4),  -- 1 Errei, 2 Difícil, 3 Bom, 4 Fácil
  intervalo_anterior   numeric(8,2),
  intervalo_novo       numeric(8,2),
  revisado_em          timestamptz not null default now()
);
create index flashcard_revisoes_user_idx on public.flashcard_revisoes (user_id, revisado_em desc);

-- -----------------------------------------------------------------------------
-- Leis secas
-- -----------------------------------------------------------------------------

create table public.leis (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  titulo       text not null,
  sigla        text,                      -- ex.: "CF/88", "Lei 8.112/90"
  area         text,                      -- ex.: "Administrativo"
  texto        text not null,             -- texto integral (markdown simples)
  fonte_url    text,
  versao_em    date,
  created_at   timestamptz not null default now()
);

create table public.lei_marcacoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  lei_id      uuid not null references public.leis on delete cascade,
  inicio      integer not null,           -- offset de caractere no texto
  fim         integer not null,
  cor         text not null default 'amarelo',
  nota        text,
  created_at  timestamptz not null default now(),
  check (fim > inicio)
);
create index lei_marcacoes_lei_idx on public.lei_marcacoes (lei_id, inicio);

-- -----------------------------------------------------------------------------
-- Mapas mentais e esquemas
-- -----------------------------------------------------------------------------

create table public.mapas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  disciplina_id  uuid references public.disciplinas on delete cascade,
  assunto        text,                    -- 2º nível da árvore (Disciplina > Assunto)
  titulo         text not null,
  tipo           text not null default 'arquivo' check (tipo in ('arquivo', 'diagrama')),
  arquivo_path   text,                    -- bucket "mapas"
  mime_type      text,
  diagrama       jsonb,                   -- futuro: { nodes, edges } do React Flow
  ordem          integer not null default 0,
  created_at     timestamptz not null default now(),
  check ((tipo = 'arquivo' and arquivo_path is not null) or (tipo = 'diagrama'))
);
create index mapas_arvore_idx on public.mapas (user_id, disciplina_id, assunto, ordem);

-- -----------------------------------------------------------------------------
-- Tutor "Pontes"
-- -----------------------------------------------------------------------------

create table public.tutor_mensagens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  contexto_tipo  text not null check (contexto_tipo in ('questao', 'lei', 'livre')),
  contexto_id    uuid,
  papel          text not null check (papel in ('user', 'assistant')),
  conteudo       text not null,
  provider       text,
  modelo         text,
  created_at     timestamptz not null default now()
);
create index tutor_mensagens_ctx_idx on public.tutor_mensagens (user_id, contexto_tipo, contexto_id, created_at);

-- -----------------------------------------------------------------------------
-- Conquistas
-- -----------------------------------------------------------------------------

create table public.conquistas (
  codigo     text primary key,
  titulo     text not null,
  descricao  text not null,
  icone      text not null,               -- nome do ícone lucide
  metrica    text not null check (metrica in ('ofensiva', 'questoes', 'acertos', 'horas', 'flashcards', 'editais', 'topicos')),
  meta       integer not null,
  ordem      smallint not null default 0
);

create table public.conquistas_desbloqueadas (
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  codigo           text not null references public.conquistas on delete cascade,
  desbloqueada_em  timestamptz not null default now(),
  primary key (user_id, codigo)
);

insert into public.conquistas (codigo, titulo, descricao, icone, metrica, meta, ordem) values
  ('ofensiva_3',     'Aquecendo',          '3 dias seguidos de ofensiva',            'flame',          'ofensiva',   3,    10),
  ('ofensiva_7',     'Semana cheia',       '7 dias seguidos de ofensiva',            'flame',          'ofensiva',   7,    11),
  ('ofensiva_30',    'Hábito formado',     '30 dias seguidos de ofensiva',           'flame-kindling', 'ofensiva',   30,   12),
  ('ofensiva_100',   'Inabalável',         '100 dias seguidos de ofensiva',          'crown',          'ofensiva',   100,  13),
  ('questoes_1',     'Primeira questão',   'Resolveu a primeira questão',            'circle-check',   'questoes',   1,    20),
  ('questoes_100',   'Centena',            '100 questões resolvidas',                'list-checks',    'questoes',   100,  21),
  ('questoes_1000',  'Milheiro',           '1.000 questões resolvidas',              'trophy',         'questoes',   1000, 22),
  ('acertos_500',    'Mira afiada',        '500 questões certas',                    'target',         'acertos',    500,  23),
  ('horas_10',       'Dez horas',          '10 horas líquidas de estudo',            'clock',          'horas',      10,   30),
  ('horas_100',      'Cem horas',          '100 horas líquidas de estudo',           'hourglass',      'horas',      100,  31),
  ('horas_500',      'Maratonista',        '500 horas líquidas de estudo',           'mountain',       'horas',      500,  32),
  ('flashcards_100', 'Memória ativa',      '100 flashcards revisados',               'layers',         'flashcards', 100,  40),
  ('flashcards_1000','Memória de elefante','1.000 flashcards revisados',             'brain',          'flashcards', 1000, 41),
  ('editais_1',      'Edital na mão',      'Importou o primeiro edital',             'file-text',      'editais',    1,    50),
  ('topicos_50',     'Ementa andando',     '50 tópicos com teoria concluída',        'book-open-check','topicos',    50,   51);

-- =============================================================================
-- Triggers de negócio
-- =============================================================================

-- Soma deltas no progresso do dia (upsert).
create or replace function public.somar_progresso(
  p_user uuid, p_dia date,
  p_segundos integer default 0, p_questoes integer default 0, p_certas integer default 0,
  p_flashcards integer default 0, p_revisoes integer default 0
) returns void
language sql
as $$
  insert into public.progresso_diario as p
    (user_id, dia, segundos_estudados, questoes_resolvidas, questoes_certas, flashcards_revisados, revisoes_feitas)
  values (p_user, p_dia, p_segundos, p_questoes, p_certas, p_flashcards, p_revisoes)
  on conflict (user_id, dia) do update set
    segundos_estudados   = greatest(p.segundos_estudados   + excluded.segundos_estudados, 0),
    questoes_resolvidas  = greatest(p.questoes_resolvidas  + excluded.questoes_resolvidas, 0),
    questoes_certas      = greatest(p.questoes_certas      + excluded.questoes_certas, 0),
    flashcards_revisados = greatest(p.flashcards_revisados + excluded.flashcards_revisados, 0),
    revisoes_feitas      = greatest(p.revisoes_feitas      + excluded.revisoes_feitas, 0);
$$;

-- Sessão de estudo -> progresso diário e minutos estudados do tópico.
create or replace function public.trg_sessao_estudo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.somar_progresso(new.user_id, public.app_date(new.inicio), p_segundos => new.segundos_liquidos);
    if new.topico_id is not null and new.tipo = 'teoria' then
      update public.topicos_ementa
         set minutos_estudados = minutos_estudados + round(new.segundos_liquidos / 60.0)::int
       where id = new.topico_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.somar_progresso(old.user_id, public.app_date(old.inicio), p_segundos => -old.segundos_liquidos);
    if old.topico_id is not null and old.tipo = 'teoria' then
      update public.topicos_ementa
         set minutos_estudados = greatest(minutos_estudados - round(old.segundos_liquidos / 60.0)::int, 0)
       where id = old.topico_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
create trigger sessoes_estudo_progresso
  after insert or delete on public.sessoes_estudo
  for each row execute function public.trg_sessao_estudo();

create or replace function public.trg_resposta_questao()
returns trigger
language plpgsql
as $$
begin
  perform public.somar_progresso(new.user_id, public.app_date(new.respondida_em),
    p_questoes => 1, p_certas => case when new.acertou then 1 else 0 end);
  return new;
end;
$$;
create trigger respostas_questoes_progresso
  after insert on public.respostas_questoes
  for each row execute function public.trg_resposta_questao();

create or replace function public.trg_flashcard_revisao()
returns trigger
language plpgsql
as $$
begin
  perform public.somar_progresso(new.user_id, public.app_date(new.revisado_em), p_flashcards => 1);
  return new;
end;
$$;
create trigger flashcard_revisoes_progresso
  after insert on public.flashcard_revisoes
  for each row execute function public.trg_flashcard_revisao();

create or replace function public.trg_revisao_feita()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'feita' and old.status <> 'feita' then
    new.feita_em := coalesce(new.feita_em, public.app_today());
    perform public.somar_progresso(new.user_id, new.feita_em, p_revisoes => 1);
  end if;
  return new;
end;
$$;
create trigger revisoes_programadas_feita
  before update of status on public.revisoes_programadas
  for each row execute function public.trg_revisao_feita();

-- Próxima data >= p_data cujo dia da semana esteja em p_dias.
create or replace function public.proximo_dia_permitido(p_data date, p_dias smallint[])
returns date
language plpgsql
immutable
as $$
declare
  d date := p_data;
begin
  if p_dias is null or cardinality(p_dias) = 0 then
    return p_data;
  end if;
  for i in 0..6 loop
    if extract(dow from d)::smallint = any (p_dias) then
      return d;
    end if;
    d := d + 1;
  end loop;
  return p_data;
end;
$$;

-- Ao concluir a teoria de um tópico, agenda as revisões espaçadas
-- de acordo com o cronograma ativo do edital (ou 1/7/14/30/90 por padrão).
create or replace function public.trg_teoria_concluida()
returns trigger
language plpgsql
as $$
declare
  v_intervalos integer[] := '{1,7,14,30,90}';
  v_dias       smallint[] := '{0,1,2,3,4,5,6}';
  v_habilitada boolean := true;
  v_base       date;
  v_num        integer := 0;
  v_intervalo  integer;
begin
  if new.teoria_concluida and not coalesce(old.teoria_concluida, false) then
    new.teoria_concluida_em := coalesce(new.teoria_concluida_em, public.app_today());
    v_base := new.teoria_concluida_em;

    select c.revisoes_intervalos, c.revisoes_dias_semana, c.revisoes_habilitadas
      into v_intervalos, v_dias, v_habilitada
      from public.cronogramas c
     where c.user_id = new.user_id and c.edital_id = new.edital_id and c.ativo
     limit 1;

    if not found then
      v_intervalos := '{1,7,14,30,90}';
      v_dias := '{0,1,2,3,4,5,6}';
      v_habilitada := true;
    end if;

    if v_habilitada then
      foreach v_intervalo in array v_intervalos loop
        v_num := v_num + 1;
        insert into public.revisoes_programadas
          (user_id, topico_id, disciplina_id, numero, intervalo_dias, data_base, data_alvo)
        values
          (new.user_id, new.id, new.disciplina_id, v_num, v_intervalo, v_base,
           public.proximo_dia_permitido(v_base + v_intervalo, v_dias))
        on conflict (topico_id, numero) do nothing;
      end loop;
    end if;
  elsif not new.teoria_concluida and coalesce(old.teoria_concluida, false) then
    -- desmarcou: remove revisões ainda pendentes
    new.teoria_concluida_em := null;
    delete from public.revisoes_programadas where topico_id = new.id and status = 'pendente';
  end if;
  return new;
end;
$$;
create trigger topicos_ementa_teoria
  before update of teoria_concluida on public.topicos_ementa
  for each row execute function public.trg_teoria_concluida();

-- =============================================================================
-- Funções de leitura (RPC)
-- =============================================================================

-- Ofensiva: dias consecutivos em que houve questões resolvidas ou flashcards
-- revisados. Hoje ainda sem atividade não quebra a sequência.
create or replace function public.calcular_ofensiva()
returns table (atual integer, recorde integer, ativo_hoje boolean)
language sql
stable
as $$
  with dias as (
    select dia
      from public.progresso_diario
     where user_id = auth.uid()
       and (questoes_resolvidas > 0 or flashcards_revisados > 0)
  ),
  ilhas as (
    select dia, dia - (row_number() over (order by dia))::int as grupo
      from dias
  ),
  sequencias as (
    select min(dia) as inicio, max(dia) as fim, count(*)::int as tamanho
      from ilhas
     group by grupo
  )
  select
    coalesce((select tamanho from sequencias where fim >= public.app_today() - 1 order by fim desc limit 1), 0),
    coalesce((select max(tamanho) from sequencias), 0),
    exists (select 1 from dias where dia = public.app_today());
$$;

-- Verifica e desbloqueia conquistas; devolve as recém-desbloqueadas.
create or replace function public.verificar_conquistas()
returns setof public.conquistas
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_ofensiva integer;
  v_questoes integer;
  v_acertos integer;
  v_horas integer;
  v_flashcards integer;
  v_editais integer;
  v_topicos integer;
begin
  if v_uid is null then
    return;
  end if;

  select recorde into v_ofensiva from public.calcular_ofensiva();
  select coalesce(sum(questoes_resolvidas), 0), coalesce(sum(questoes_certas), 0),
         coalesce(sum(segundos_estudados), 0) / 3600, coalesce(sum(flashcards_revisados), 0)
    into v_questoes, v_acertos, v_horas, v_flashcards
    from public.progresso_diario where user_id = v_uid;
  select count(*) into v_editais from public.editais where user_id = v_uid;
  select count(*) into v_topicos from public.topicos_ementa where user_id = v_uid and teoria_concluida;

  return query
  with novas as (
    insert into public.conquistas_desbloqueadas (user_id, codigo)
    select v_uid, c.codigo
      from public.conquistas c
     where case c.metrica
             when 'ofensiva'   then v_ofensiva
             when 'questoes'   then v_questoes
             when 'acertos'    then v_acertos
             when 'horas'      then v_horas
             when 'flashcards' then v_flashcards
             when 'editais'    then v_editais
             when 'topicos'    then v_topicos
           end >= c.meta
    on conflict do nothing
    returning codigo
  )
  select c.* from public.conquistas c join novas n on n.codigo = c.codigo order by c.ordem;
end;
$$;

-- Importa o resultado (revisado) da IA de forma atômica.
-- p_payload = { edital: {...}, disciplinas: [{ nome, area?, peso?, qtd_questoes?,
--               topicos: [{ codigo?, titulo, subtopicos: [{ codigo?, titulo }] }] }] }
create or replace function public.importar_edital(p_payload jsonb, p_importacao_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_edital_id uuid;
  v_carreira text;
  v_disc jsonb;
  v_disc_ord integer;
  v_disc_id uuid;
  v_top jsonb;
  v_top_ord integer;
  v_top_id uuid;
  v_sub jsonb;
  v_sub_ord integer;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  v_carreira := coalesce(nullif(p_payload #>> '{edital,carreira}', ''), 'geral');
  if v_carreira not in ('direito', 'ti', 'geral') then
    v_carreira := 'geral';
  end if;

  insert into public.editais (user_id, nome, orgao, banca, cargo, carreira, ano, data_prova, arquivo_path, observacoes)
  values (
    v_uid,
    coalesce(nullif(p_payload #>> '{edital,nome}', ''), 'Edital sem nome'),
    nullif(p_payload #>> '{edital,orgao}', ''),
    nullif(p_payload #>> '{edital,banca}', ''),
    nullif(p_payload #>> '{edital,cargo}', ''),
    v_carreira,
    nullif(p_payload #>> '{edital,ano}', '')::smallint,
    nullif(p_payload #>> '{edital,data_prova}', '')::date,
    nullif(p_payload #>> '{edital,arquivo_path}', ''),
    nullif(p_payload #>> '{edital,observacoes}', '')
  )
  returning id into v_edital_id;

  for v_disc, v_disc_ord in
    select value, ordinality from jsonb_array_elements(coalesce(p_payload -> 'disciplinas', '[]')) with ordinality
  loop
    insert into public.disciplinas as d (user_id, nome, area)
    values (v_uid, trim(v_disc ->> 'nome'),
            case when v_disc ->> 'area' in ('direito', 'ti', 'geral') then v_disc ->> 'area' else v_carreira end)
    on conflict (user_id, lower(nome)) do update set nome = d.nome
    returning id into v_disc_id;

    insert into public.edital_disciplinas (edital_id, disciplina_id, user_id, peso, qtd_questoes, ordem)
    values (v_edital_id, v_disc_id, v_uid,
            nullif(v_disc ->> 'peso', '')::numeric,
            nullif(v_disc ->> 'qtd_questoes', '')::smallint,
            v_disc_ord)
    on conflict (edital_id, disciplina_id) do nothing;

    for v_top, v_top_ord in
      select value, ordinality from jsonb_array_elements(coalesce(v_disc -> 'topicos', '[]')) with ordinality
    loop
      insert into public.topicos_ementa (user_id, edital_id, disciplina_id, codigo, titulo, ordem)
      values (v_uid, v_edital_id, v_disc_id, nullif(v_top ->> 'codigo', ''), trim(v_top ->> 'titulo'), v_top_ord)
      returning id into v_top_id;

      for v_sub, v_sub_ord in
        select value, ordinality from jsonb_array_elements(coalesce(v_top -> 'subtopicos', '[]')) with ordinality
      loop
        insert into public.topicos_ementa (user_id, edital_id, disciplina_id, parent_id, codigo, titulo, ordem)
        values (v_uid, v_edital_id, v_disc_id, v_top_id, nullif(v_sub ->> 'codigo', ''), trim(v_sub ->> 'titulo'), v_sub_ord);
      end loop;
    end loop;
  end loop;

  if p_importacao_id is not null then
    update public.edital_importacoes
       set status = 'confirmada', edital_id = v_edital_id
     where id = p_importacao_id and user_id = v_uid;
  end if;

  return v_edital_id;
end;
$$;

-- Ementa com Teoria / Revisões / Aproveitamento por tópico.
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
       then round(100.0 * q.certas / q.resolvidas, 1) end as aproveitamento
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
) q on true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'configuracoes', 'editais', 'disciplinas', 'edital_disciplinas', 'topicos_ementa',
    'edital_importacoes', 'cronogramas', 'cronograma_disciplinas', 'revisoes_programadas',
    'cronograma_itens', 'sessoes_estudo', 'progresso_diario', 'questoes', 'respostas_questoes',
    'flashcards', 'flashcard_revisoes', 'leis', 'lei_marcacoes', 'mapas', 'tutor_mensagens',
    'conquistas_desbloqueadas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_dono', t);
  end loop;
end;
$$;

alter table public.conquistas enable row level security;
create policy conquistas_leitura on public.conquistas for select to authenticated using (true);

-- =============================================================================
-- Storage: buckets privados, um "diretório" por usuário ({uid}/arquivo.pdf)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('editais', 'editais', false, 52428800, array['application/pdf']),
  ('mapas',   'mapas',   false, 52428800, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "arquivos do proprio usuario - leitura" on storage.objects
  for select to authenticated
  using (bucket_id in ('editais', 'mapas') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos do proprio usuario - escrita" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('editais', 'mapas') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos do proprio usuario - atualizacao" on storage.objects
  for update to authenticated
  using (bucket_id in ('editais', 'mapas') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos do proprio usuario - exclusao" on storage.objects
  for delete to authenticated
  using (bucket_id in ('editais', 'mapas') and (storage.foldername(name))[1] = (select auth.uid())::text);
