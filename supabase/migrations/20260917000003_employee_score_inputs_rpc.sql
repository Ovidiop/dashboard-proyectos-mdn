-- RPC de la Evaluación automática de desempeño: un solo roundtrip por mes con todo lo
-- que necesitan los 9 indicadores de src/utils/employeeScore.js, ya acotado a los
-- empleados que el caller puede ver (mismo predicado que la RLS de
-- employee_score_snapshots) y a la ventana del mes ±1 (taskInMonth/arrastre cruzan
-- meses). Evita el N+1 de cruzar 9 tablas × N empleados desde el cliente.
create or replace function public.employee_score_inputs(p_year int, p_month int)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $function$
declare
  v_caller        uuid := auth.uid();
  v_company_uuid  uuid;
  v_company_text  text;
  v_access_level  int;
  v_can_view_all  boolean;
  v_month_start   date := make_date(p_year, p_month, 1);
  v_month_end     date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_prev_start    date := (make_date(p_year, p_month, 1) - interval '1 month')::date;
  v_next_end      date := (make_date(p_year, p_month, 1) + interval '2 month - 1 day')::date;
  v_visible_ids   text[];
begin
  select company_id, coalesce(access_level, 1)
  into v_company_uuid, v_access_level
  from public.users
  where user_id = v_caller;

  if v_company_uuid is null then
    raise exception 'employee_score_inputs: usuario sin perfil de empresa';
  end if;

  v_company_text := v_company_uuid::text;
  v_can_view_all := public.task_user_view_all() or public.user_can('evaluaciones.ver_todo');

  if v_can_view_all then
    select array_agg(user_id::text)
    into v_visible_ids
    from public.users
    where company_id = v_company_uuid and deleted_at is null;
  else
    select array_agg(distinct u.user_id::text)
    into v_visible_ids
    from public.users u
    where u.company_id = v_company_uuid
      and u.deleted_at is null
      and (
        u.user_id = v_caller
        or (
          v_access_level >= 2
          and exists (
            select 1 from public.metric_line_members mlm
            where mlm.user_id = u.user_id::text
              and public.task_user_in_line(mlm.line_id::text)
          )
        )
      );
  end if;

  v_visible_ids := coalesce(v_visible_ids, array[v_caller::text]);

  return jsonb_build_object(
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'first_name', u.first_name, 'last_name', u.last_name,
        'avatar_url', u.avatar_url, 'access_level', u.access_level,
        'department_id', u.department_id, 'position_id', u.position_id,
        'hire_date', u.hire_date, 'on_probation', u.on_probation
      )), '[]'::jsonb)
      from public.users u
      where u.user_id::text = any(v_visible_ids)
    ),
    'clients', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.metric_clients c
      where c.company_id = v_company_text and c.deleted_at is null
    ),
    'tasks', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.tasks t
      where t.company_id = v_company_text
        and t.assignee_ids && v_visible_ids
        and t.request_date between v_prev_start and v_next_end
    ),
    'cnp', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.cnp_requests c
      where c.company_id = v_company_text
        and c.assignee_id = any(v_visible_ids)
        and c.created_at::date between v_prev_start and v_next_end
    ),
    'marks', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.fixed_task_marks m
      where m.company_id = v_company_text
        and m.period_year = p_year and m.period_month = p_month
    ),
    'piezas', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from public.av_pauta_piezas p
      where p.company_id = v_company_text
        and p.editor_user_id = any(v_visible_ids)
        and p.created_at::date between v_prev_start and v_next_end
    ),
    'meetings', (
      select coalesce(jsonb_agg(to_jsonb(mt)), '[]'::jsonb)
      from public.meetings mt
      where mt.company_id = v_company_text
        and mt.attendee_ids && v_visible_ids
        and mt.starts_at::date between v_prev_start and v_next_end
    ),
    'campaigns', (
      -- `campaigns` no tiene company_id (a diferencia de paid_campaigns) — el scope de
      -- empresa ya lo da v_visible_ids, acotado arriba a los usuarios de v_company_uuid.
      select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      from public.campaigns cp
      where cp.assignee = any(v_visible_ids)
        and cp.created_at::date between v_prev_start and v_next_end
    ),
    'paidCampaigns', (
      select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb)
      from public.paid_campaigns pc
      where pc.company_id = v_company_text
        and pc.responsable_id = any(v_visible_ids)
        and coalesce(pc.updated_at, pc.created_at)::date between v_prev_start and v_next_end
    ),
    'checks', (
      select coalesce(jsonb_agg(to_jsonb(ch)), '[]'::jsonb)
      from public.publication_checks ch
      where ch.company_id = v_company_text
        and ch.updated_by = any(v_visible_ids)
        and ch.updated_at::date between v_prev_start and v_next_end
    ),
    'tickets', (
      select coalesce(jsonb_agg(to_jsonb(tk)), '[]'::jsonb)
      from public.support_tickets tk
      where tk.company_id = v_company_uuid
        and tk.assigned_to::text = any(v_visible_ids)
        and tk.created_at::date between v_prev_start and v_next_end
    ),
    'vacations', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.vacations v
      where v.company_id = v_company_uuid
        and v.user_id::text = any(v_visible_ids)
        and v.end_date >= v_month_start
        and v.start_date <= v_month_end
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from public.employee_score_profiles p
      where p.company_id = v_company_text
    )
  );
end;
$function$;

-- Postgres concede EXECUTE a PUBLIC por defecto en funciones nuevas — revocarlo es
-- necesario para que `anon` no pueda invocar esta SECURITY DEFINER sin sesión.
revoke execute on function public.employee_score_inputs(int, int) from public;
revoke execute on function public.employee_score_inputs(int, int) from anon;
grant execute on function public.employee_score_inputs(int, int) to authenticated;
