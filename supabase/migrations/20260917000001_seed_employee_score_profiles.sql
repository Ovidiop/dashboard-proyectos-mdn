-- Siembra los 7 perfiles de peso por cargo para la empresa existente (ver
-- ARQUITECTURA.md §2.7 y src/utils/employeeScoreProfiles.js). Matchean por
-- department_id (departments: 0 IT, 1 Redes, 2 Audiovisual, 3 Diseño, 5
-- Administración, 6 Dirección) salvo Marketing/Ads, que matchea por el cargo
-- "Marketing Manager" (más específico que departamento — Sub Dirección mezcla
-- varios cargos que no son de marketing).
--
-- No hardcodea el company_id: esta empresa es la única fila de `companies` hoy.
do $$
declare
  v_company_id text;
  v_marketing_manager_id int;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'seed_employee_score_profiles: no hay ninguna empresa en companies';
  end if;

  select position_id into v_marketing_manager_id
  from public.positions
  where position_name = 'Marketing Manager'
  limit 1;

  insert into public.employee_score_profiles (company_id, name, priority, match, weights, is_default)
  values
    (v_company_id, 'Default', 0, '{}'::jsonb,
      '{"entregas":25,"puntualidad":20,"arrastre":10,"tareas_fijas":15,"piezas_av":10,"reuniones":5,"campanas":5,"chequeo":5,"tickets":0}'::jsonb,
      true),
    (v_company_id, 'Redes / Social', 0, jsonb_build_object('department_ids', jsonb_build_array(1)),
      '{"entregas":25,"puntualidad":20,"arrastre":10,"tareas_fijas":20,"piezas_av":0,"reuniones":5,"campanas":10,"chequeo":10,"tickets":0}'::jsonb,
      false),
    (v_company_id, 'Diseño', 0, jsonb_build_object('department_ids', jsonb_build_array(3)),
      '{"entregas":30,"puntualidad":25,"arrastre":10,"tareas_fijas":25,"piezas_av":5,"reuniones":5,"campanas":0,"chequeo":0,"tickets":0}'::jsonb,
      false),
    (v_company_id, 'Audiovisual', 0, jsonb_build_object('department_ids', jsonb_build_array(2)),
      '{"entregas":25,"puntualidad":20,"arrastre":10,"tareas_fijas":0,"piezas_av":35,"reuniones":5,"campanas":0,"chequeo":0,"tickets":0}'::jsonb,
      false),
    (v_company_id, 'IT', 0, jsonb_build_object('department_ids', jsonb_build_array(0)),
      '{"entregas":25,"puntualidad":20,"arrastre":10,"tareas_fijas":0,"piezas_av":0,"reuniones":5,"campanas":0,"chequeo":0,"tickets":40}'::jsonb,
      false),
    (v_company_id, 'Dirección / Administración', 0, jsonb_build_object('department_ids', jsonb_build_array(5, 6)),
      '{"entregas":35,"puntualidad":30,"arrastre":15,"tareas_fijas":0,"piezas_av":0,"reuniones":20,"campanas":0,"chequeo":0,"tickets":0}'::jsonb,
      false);

  if v_marketing_manager_id is not null then
    insert into public.employee_score_profiles (company_id, name, priority, match, weights, is_default)
    values (
      v_company_id, 'Marketing / Ads', 0,
      jsonb_build_object('position_ids', jsonb_build_array(v_marketing_manager_id)),
      '{"entregas":25,"puntualidad":20,"arrastre":10,"tareas_fijas":0,"piezas_av":0,"reuniones":10,"campanas":35,"chequeo":0,"tickets":0}'::jsonb,
      false
    );
  end if;
end $$;
