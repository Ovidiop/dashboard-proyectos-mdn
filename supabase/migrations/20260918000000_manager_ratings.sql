-- Evaluación subjetiva mensual del jefe (ver ARQUITECTURA.md §2.7). Complementa el score
-- automático de desempeño con criterios definidos por cargo, en el espíritu del ejemplo
-- de "fichas técnicas": cada cargo tiene sus propias 3-4 casillas, no una lista global.
--
-- Dos tablas:
--  - evaluation_criteria: qué evalúa el jefe en cada cargo (config, no evaluación de
--    personas — mismo espíritu que employee_score_profiles).
--  - manager_ratings: la evaluación de un empleado en un mes (items congelados +
--    promedio 1-5). No revive evaluation_sessions/responses (solo lectura desde F6,
--    20260917000005_evaluations_readonly.sql) — ese esquema es un cuestionario largo
--    atado a `questions`; aquí son pocas casillas que se guardan juntas.

create table public.evaluation_criteria (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  position_id  bigint not null references public.positions(position_id) on delete cascade,
  sort_order   int not null default 0,
  icon         text,
  name         text not null,
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text
);

create index evaluation_criteria_position_idx
  on public.evaluation_criteria (position_id, sort_order)
  where active;

create table public.manager_ratings (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  user_id      text not null,
  year         int not null,
  month        int not null,
  position_id  bigint references public.positions(position_id),
  items        jsonb not null,            -- [{criterion_id, icon, name, score}], copia congelada
  promedio     numeric(3,2) not null,     -- 1.00-5.00
  comment      text,
  rated_by     text not null,
  rated_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint manager_ratings_month_check check (month between 1 and 12),
  constraint manager_ratings_promedio_check check (promedio between 1 and 5),
  constraint manager_ratings_unique unique (user_id, year, month)
);

create index manager_ratings_company_period_idx
  on public.manager_ratings (company_id, year, month);

alter table public.evaluation_criteria enable row level security;
alter table public.manager_ratings enable row level security;

-- Criterios: lectura abierta (el empleado debe poder ver con qué se le mide, igual que
-- employee_score_profiles), escritura gated por la misma capability del panel de pesos
-- (se edita en la misma pestaña de Empresa → Perfiles de Desempeño).
create policy "evaluation_criteria_select" on public.evaluation_criteria
  for select to authenticated
  using (true);

create policy "evaluation_criteria_write" on public.evaluation_criteria
  for all to authenticated
  using (public.user_can('evaluaciones.perfiles.manage'))
  with check (public.user_can('evaluaciones.perfiles.manage'));

-- Ratings: SELECT con la misma visibilidad que employee_score_snapshots (propio, su
-- línea nivel 2-3, o todos con evaluaciones.ver_todo). INSERT/UPDATE requieren la
-- capability evaluaciones.evaluar, la misma visibilidad, y prohíben autoevaluación.
-- Sin política de DELETE → denegado por defecto (corregir es editar, queda updated_at).
create policy "manager_ratings_select" on public.manager_ratings
  for select to authenticated
  using (
    user_id = auth.uid()::text
    or public.user_can('evaluaciones.ver_todo')
    or (
      public.task_user_access_level() >= 2
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.user_id = manager_ratings.user_id
          and public.task_user_in_line(mlm.line_id::text)
      )
    )
  );

create policy "manager_ratings_insert" on public.manager_ratings
  for insert to authenticated
  with check (
    public.user_can('evaluaciones.evaluar')
    and user_id <> auth.uid()::text
    and (
      public.user_can('evaluaciones.ver_todo')
      or (
        public.task_user_access_level() >= 2
        and exists (
          select 1 from public.metric_line_members mlm
          where mlm.user_id = manager_ratings.user_id
            and public.task_user_in_line(mlm.line_id::text)
        )
      )
    )
  );

create policy "manager_ratings_update" on public.manager_ratings
  for update to authenticated
  using (
    public.user_can('evaluaciones.evaluar')
    and user_id <> auth.uid()::text
    and (
      public.user_can('evaluaciones.ver_todo')
      or (
        public.task_user_access_level() >= 2
        and exists (
          select 1 from public.metric_line_members mlm
          where mlm.user_id = manager_ratings.user_id
            and public.task_user_in_line(mlm.line_id::text)
        )
      )
    )
  )
  with check (
    public.user_can('evaluaciones.evaluar')
    and user_id <> auth.uid()::text
  );
