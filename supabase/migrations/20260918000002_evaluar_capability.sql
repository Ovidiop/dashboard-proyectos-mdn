-- Capability para evaluar mensualmente los criterios subjetivos por cargo (ver
-- ARQUITECTURA.md §2.7 y 20260918000000_manager_ratings.sql). Nivel 3+ o admin, igual
-- que el resto del tramo de jefatura (reportes.manage, ads.manage).
do $$
declare
  v_company_id text;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'evaluar_capability: no hay ninguna empresa en companies';
  end if;

  insert into public.module_permissions (company_id, module_key, rules)
  values
    (v_company_id, 'evaluaciones.evaluar', '{"deny":[],"rules":[{"all":[{"type":"min_level","value":3,"ids":[]}]}]}'::jsonb)
  on conflict (company_id, module_key) do nothing;
end $$;
