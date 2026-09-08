-- Evaluación automática de desempeño (ver ARQUITECTURA.md §2.7). Reemplaza el flujo
-- manual (evaluation_sessions + preguntas 1-5) por un score 0-100 por empleado y mes,
-- derivado de datos que ya existen en otros módulos (tasks, cnp_requests,
-- fixed_task_marks, av_pauta_piezas, meetings, campaigns/paid_campaigns,
-- publication_checks, support_tickets). Ver src/utils/employeeScore.js para la fórmula.
--
-- Dos tablas:
--  - employee_score_profiles: pesos por cargo (config, no evaluación de personas).
--  - employee_score_snapshots: el score congelado de cada empleado×mes, inmutable una
--    vez `frozen = true` (mismo patrón que metric_reports_prevent_closed_edit).

create table public.employee_score_profiles (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  name        text not null,
  priority    int not null default 0,
  match       jsonb not null default '{}',   -- {position_ids:[], department_ids:[], min_level}
  weights     jsonb not null,                 -- {entregas:25, puntualidad:20, ...}
  is_default  boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Un solo perfil `is_default = true` por empresa (siempre debe existir uno).
create unique index employee_score_profiles_one_default_per_company
  on public.employee_score_profiles (company_id)
  where is_default;

create table public.employee_score_snapshots (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null,
  user_id           text not null,
  year              int not null,
  month             int not null,
  score             numeric(5,2),             -- null = sin datos suficientes
  estado            text not null check (estado in ('ok', 'parcial', 'sin_datos')),
  breakdown         jsonb not null,
  disponibilidad    numeric(4,3) not null default 1,
  auto_circulo_pct  numeric(4,3),
  en_ranking        boolean not null default true,
  profile_id        uuid references public.employee_score_profiles(id),
  profile_name      text,
  narrativa         text,
  computed_at       timestamptz not null default now(),
  computed_by       text,
  frozen            boolean not null default true,
  constraint employee_score_snapshots_month_check check (month between 1 and 12),
  constraint employee_score_snapshots_unique unique (user_id, year, month)
);

create index employee_score_snapshots_company_period_idx
  on public.employee_score_snapshots (company_id, year, month);

-- ── Inmutabilidad: un snapshot congelado no se edita a mano ──────────────────────
-- Mismo patrón que metric_reports_prevent_closed_edit, con bypass para service_role
-- (Netlify Function) — igual que prevent_users_privilege_escalation — para poder
-- recomputar tras un fix de fórmula.
create or replace function public.prevent_score_snapshot_edit()
returns trigger
language plpgsql
as $function$
begin
  -- BEFORE DELETE: NEW es NULL — hay que devolver OLD para permitir el borrado
  -- (devolver NEW, que sería NULL, lo cancela en silencio sin avisar).
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if old.frozen then
    raise exception 'employee_score_snapshots: el score de % (%/%) está congelado y no se puede modificar',
      old.user_id, old.month, old.year;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger employee_score_snapshots_prevent_edit
  before update or delete on public.employee_score_snapshots
  for each row execute function public.prevent_score_snapshot_edit();

alter table public.employee_score_profiles enable row level security;
alter table public.employee_score_snapshots enable row level security;

-- Perfiles: lectura abierta (el empleado debe poder ver por qué pesa lo que pesa),
-- escritura gated por capability.
create policy "employee_score_profiles_select" on public.employee_score_profiles
  for select to authenticated
  using (true);

create policy "employee_score_profiles_write" on public.employee_score_profiles
  for all to authenticated
  using (public.user_can('evaluaciones.perfiles.manage'))
  with check (public.user_can('evaluaciones.perfiles.manage'));

-- Snapshots: SELECT implementa la visibilidad acordada — el propio, su línea (nivel
-- 2-3), o todos (nivel 4/admin vía evaluaciones.ver_todo). Sin políticas de
-- INSERT/UPDATE/DELETE para `authenticated` → deny by default, solo service_role escribe.
create policy "employee_score_snapshots_select" on public.employee_score_snapshots
  for select to authenticated
  using (
    user_id = auth.uid()::text
    or public.user_can('evaluaciones.ver_todo')
    or (
      public.task_user_access_level() >= 2
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.user_id = employee_score_snapshots.user_id
          and public.task_user_in_line(mlm.line_id::text)
      )
    )
  );
