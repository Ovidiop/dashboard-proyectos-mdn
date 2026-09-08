-- Siembra los criterios subjetivos por cargo que evalúa el jefe (ver ARQUITECTURA.md
-- §2.7 y src/utils/managerRating.js). Redactados según lo que produce cada cargo, no
-- una lista global — mismo criterio que 20260917000001_seed_employee_score_profiles.sql.
-- Cargos sin fila aquí simplemente no muestran el bloque del jefe en la ficha.
do $$
declare
  v_company_id text;
  v_pos_id     bigint;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'seed_evaluation_criteria: no hay ninguna empresa en companies';
  end if;

  -- Social Media Manager
  select position_id into v_pos_id from public.positions where position_name = 'Social Media Manager' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad del feed', 'Los feeds son dinámicos, responden a los intereses del cliente y siguen la táctica.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso con el cliente', 'Procesa los cambios que pide el cliente rápido y sin problemas.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Explica bien sus ideas y se le entiende fácil dentro del equipo.');
  end if;

  -- Community Manager (4 criterios: es de los cargos sin indicadores automáticos)
  select position_id into v_pos_id from public.positions where position_name = 'Community Manager' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad de las respuestas', 'Sigue el tono y estilo de la marca al interactuar con la comunidad.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Hace seguimiento a las interacciones para que no quede nada pendiente.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Informa rápido al equipo sobre mensajes importantes y se coordina para responder dudas.'),
      (v_company_id, v_pos_id, 4, '🎯', 'Responsabilidad', 'Sabe manejar bien comentarios negativos o crisis en redes.');
  end if;

  -- Diseñador
  select position_id into v_pos_id from public.positions where position_name = 'Diseñador' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Los diseños tienen un nivel sobresaliente y cumplen con lo que se necesita sin muchos ajustes.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Acepta bien los cambios y los aplica sin problemas.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Sigue el estilo y la identidad de marca, y trabaja con orden y archivos organizados.');
  end if;

  -- Coord. de Diseño
  select position_id into v_pos_id from public.positions where position_name = 'Coord. de Diseño' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Revisa los diseños del equipo antes de entregarlos para asegurarse de que estén correctos.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Se asegura de que los diseños del equipo estén listos y entregados a tiempo.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Explica bien las instrucciones a su equipo.');
  end if;

  -- Creador de Contenido Audiovisual
  select position_id into v_pos_id from public.positions where position_name = 'Creador Cont. Audiov.' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Graba o produce contenido que se ve bien y cumple con lo solicitado.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Usa bien las herramientas y equipos de grabación para obtener buenos resultados.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Trabaja bien en equipo para cumplir lo acordado con los clientes.');
  end if;

  -- Fotógrafo
  select position_id into v_pos_id from public.positions where position_name = 'Fotógrafo' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Usa bien la iluminación y composición para mejorar sus fotos.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Chequea a tiempo todo lo que necesita para una sesión (moodboards, equipos, logística).'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Trabaja bien con el equipo para planificar y realizar sesiones de fotos.');
  end if;

  -- Editor de Video
  select position_id into v_pos_id from public.positions where position_name = 'Editor de video' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Edita videos de buena calidad, con efectos y ritmo que cumplen con lo solicitado.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Hace ajustes y cambios en la edición cuando se lo piden sin problemas.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Trabaja bien en equipo para que los videos estén alineados con las tácticas del cliente.');
  end if;

  -- Jefe de Cuentas
  select position_id into v_pos_id from public.positions where position_name = 'Jefe de Cuentas' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Resuelve rápidamente los problemas, solicitudes y dudas de los clientes.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Habla seguido con los clientes para conocer y mejorar su nivel de satisfacción.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Explica bien las instrucciones a su equipo.');
  end if;

  -- Coord. de Cuentas
  select position_id into v_pos_id from public.positions where position_name = 'Coord. de Cuentas' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'Se asegura de que el material generado esté correcto antes de enviarlo al departamento correspondiente.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Hace seguimiento a cada tarea hasta que se complete sin retrasos.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Trabaja bien en equipo para cumplir lo acordado con los clientes.');
  end if;

  -- Programador
  select position_id into v_pos_id from public.positions where position_name = 'Programador' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'El trabajo entregado funciona bien y cumple con lo solicitado.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Organiza bien su trabajo para evitar retrasos.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Responde bien y con respeto cuando le piden algo o le dan feedback.');
  end if;

  -- Asistente administrativo
  select position_id into v_pos_id from public.positions where position_name = 'Asistente administrativo' limit 1;
  if v_pos_id is not null then
    insert into public.evaluation_criteria (company_id, position_id, sort_order, icon, name, description)
    values
      (v_company_id, v_pos_id, 1, '⭐', 'Calidad', 'El trabajo administrativo se entrega correcto y sin errores.'),
      (v_company_id, v_pos_id, 2, '🤝', 'Compromiso', 'Organiza bien la información y materiales que maneja.'),
      (v_company_id, v_pos_id, 3, '🗣️', 'Comunicación', 'Responde rápido cuando se le pide apoyo en algo.');
  end if;
end $$;
