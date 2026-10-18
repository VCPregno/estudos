# Estudos

Plataforma pessoal de estudos para concursos (Direito e TI). Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 com componentes no padrão shadcn/ui, Zustand e Supabase.

Este é o primeiro passo do projeto: arquitetura de pastas, schema completo do banco, algoritmo do Ciclo Dinâmico, Dashboard (Meu Dia) com timer e ofensiva, e o Importador de Edital com IA. Os demais módulos já têm rota, tabelas e funções no banco, faltando a interface.

## Rodar

```bash
npm install
npm run dev
```

Sem `.env.local`, o app abre em modo demonstração: a Dashboard usa um edital de exemplo (TRT-2) passando pelo mesmo algoritmo do ciclo, e nada é gravado.

```bash
npm test          # testes do algoritmo do ciclo
npm run lint
npm run build
```

## Configurar o Supabase

1. Crie um projeto no Supabase.
2. Rode a migration `supabase/migrations/20261018000000_schema_inicial.sql`. Pelo painel: SQL Editor, cole o arquivo e execute. Pela CLI: `supabase link` e `supabase db push`.
3. Em Authentication, crie o seu usuário (e-mail e senha) e desative "Allow new users to sign up". O app é de uso pessoal; com cadastro aberto qualquer pessoa criaria uma conta.
4. Copie `.env.example` para `.env.local` e preencha URL e publishable key (Project Settings, API Keys).
5. Para tipos gerados do banco, se quiser: `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.

Todas as tabelas têm RLS por `user_id = auth.uid()`. Os PDFs ficam em buckets privados (`editais`, `mapas`), numa pasta por usuário.

## IA

O provedor é trocável. Claude é o padrão porque lê PDF nativamente e o SDK garante o JSON no formato do schema; Gemini fica como alternativa (tem nível gratuito). Basta uma chave no `.env.local`; `AI_PROVIDER` escolhe quando houver as duas. Os modelos podem ser trocados por variável de ambiente.

Para economizar, informe na tela de importação só as páginas do conteúdo programático (ex.: `45-80`). O navegador recorta o PDF antes de enviar. A leitura pelo Claude aceita até 100 páginas por vez.

Fluxo: o navegador sobe o PDF para o Storage, a rota `/api/editais/extrair` manda para a IA e devolve disciplinas e tópicos para revisão. Só depois da confirmação a função `importar_edital()` grava tudo numa transação. Cada leitura fica registrada em `edital_importacoes` com modelo e tokens.

A rota `/api/tutor` (Tutor Pontes) já funciona e será ligada ao Banco de Questões.

## Importar questões e flashcards

```bash
npm run importar -- questoes  meu-arquivo.csv --dry-run   # só valida
npm run importar -- questoes  meu-arquivo.csv
npm run importar -- flashcards meu-arquivo.json
```

Formatos em `scripts/exemplos/`. O script entra com o seu usuário (`SUPABASE_EMAIL` e `SUPABASE_SENHA`), cria disciplinas que não existirem e não duplica linhas: a chave é o `external_id` ou, sem ele, um hash do conteúdo. Reimportar flashcards não zera o progresso deles.

## Como o Ciclo Dinâmico funciona

Código em `src/lib/ciclo/`, testes em `algoritmo.test.ts`.

A agenda não é guardada como verdade; ela é recalculada a partir do progresso (minutos estudados por tópico, revisões pendentes e a posição atual no ciclo). Por isso, um dia sem estudo não gera atraso: a fila inteira só anda para frente, na mesma ordem.

1. Uma volta do ciclo intercala as disciplinas pelo peso (peso 3, 2 e 1 vira A B A C B A).
2. Cada turno dá um bloco de minutos à disciplina, gasto nos tópicos dela em ordem. Disciplina sem conteúdo restante sai do rodízio.
3. Cada dia recebe primeiro as revisões vencidas (com teto de 50% do dia enquanto houver teoria, para não travar o edital) e depois a fila de teoria. Bloco que não cabe continua no dia seguinte.
4. Ao terminar um tópico, as revisões de 1, 7, 14, 30 e 90 dias são agendadas nos dias da semana permitidos. No banco isso é feito por trigger quando a teoria é marcada como concluída.
5. A data de conclusão aparece de duas formas: no plano e no seu ritmo real (minutos estudados sobre minutos disponíveis nas últimas duas semanas).

No modo fixo o plano é gerado uma vez a partir da data de início, e o que vence sem ser feito aparece como atrasado.

## Estrutura

```
supabase/migrations/      schema, triggers, RLS, funções (ofensiva, conquistas, importar_edital) e view v_ementa
scripts/                  importação em lote e arquivos de exemplo
src/proxy.ts              renova a sessão e protege as rotas (no Next 16, middleware virou proxy)
src/app/(app)/            páginas com sidebar e cabeçalho: Meu Dia, Editais e os módulos ainda vazios
src/app/api/              extração de edital e tutor
src/app/actions/          server actions (salvar sessão, concluir teoria, confirmar importação)
src/lib/ciclo/            algoritmo do ciclo dinâmico, puro e testado
src/lib/ai/               provedores Claude e Gemini, schema do edital, prompts
src/lib/data/             carregamento da Dashboard (real e demonstração)
src/stores/               timer de sessão (Zustand, persistido)
src/features/             telas da Dashboard e do Importador
src/components/ui/        componentes no padrão shadcn/ui
```

Os componentes shadcn foram escritos à mão porque o registro do shadcn não estava acessível na criação. Seguem o mesmo padrão (`components.json` incluso), então `npx shadcn add <componente>` funciona normalmente.

O projeto usa Cache Components (padrão do Next 16): tudo que lê cookies ou a data de hoje fica dentro de `<Suspense>`.

## Próximos passos

Wizard de cronograma (com arrastar e soltar), tabela da Ementa, Banco de Questões com o botão do tutor, Flashcards com o algoritmo de repetição, leitor de Leis Secas com marcações e a árvore de Mapas.
