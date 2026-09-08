-- Perfil de peso "Operativo / Back-office" para cargos de coordinación/dirección
-- que no producen contenido (ver ARQUITECTURA.md §2.7). Sin este perfil, estos cargos
-- caían en el perfil "Default" (`employee_score_profiles`), que reparte peso en
-- indicadores que no les aplican (piezas audiovisuales, campañas, chequeo, tareas
-- fijas) — inflando artificialmente su score o dejándolo sin sentido. Detectado con
-- Coord. Tecnología: su `users.department_id` es null (dato incompleto) y su cargo no
-- matcheaba ningún perfil por departamento, así que caía al Default.
--
-- Match por `position_ids` (máxima especificidad, gana sobre cualquier perfil por
-- departamento) para Sub-Director, Coord. Tecnología y Coord. de Desarrollo Laboral —
-- los únicos cargos que hoy caen efectivamente en Default (verificado contra la data
-- real: los demás cargos de dirección/coordinación ya matchean un perfil por
-- departamento con pesos razonables, ver Dirección/Administración e IT).
do $$
declare
  v_company_id text;
  v_pos_ids    jsonb;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'seed_backoffice_score_profile: no hay ninguna empresa en companies';
  end if;

  select jsonb_agg(position_id) into v_pos_ids
  from public.positions
  where position_name in ('Sub-Director', 'Coord. Tecnología', 'Coord. de Desarrollo Laboral');

  if v_pos_ids is not null then
    insert into public.employee_score_profiles (company_id, name, priority, match, weights, is_default)
    values (
      v_company_id, 'Operativo / Back-office', 0,
      jsonb_build_object('position_ids', v_pos_ids),
      '{"entregas":60,"puntualidad":25,"arrastre":15,"tareas_fijas":0,"piezas_av":0,"reuniones":0,"campanas":0,"chequeo":0,"tickets":0}'::jsonb,
      false
    );
  end if;
end $$;
