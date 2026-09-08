-- Capabilities nuevas de la Evaluación automática de desempeño (ver ARQUITECTURA.md
-- §2.7). No se toca `evaluaciones.manage` todavía (se retira en la fase F6, cuando se
-- desmonta el flujo manual) ni las capabilities existentes de tabs viejos.
do $$
declare
  v_company_id text;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'evaluaciones_capabilities: no hay ninguna empresa en companies';
  end if;

  insert into public.module_permissions (company_id, module_key, rules)
  values
    -- Tab "Desempeño" (lista de otros empleados + ranking): nivel 2+, igual que
    -- el tab "Empleados" del flujo manual que reemplaza. La RLS ya acota qué filas
    -- ve cada quien; esto acota el tab en sí.
    (v_company_id, 'evaluaciones.desempeno', '{"deny":[],"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb),
    -- Ver el score propio y el desglose: abierto a cualquier autenticado.
    (v_company_id, 'evaluaciones.mi-desempeno', '{"deny":[],"rules":[{"all":[]}]}'::jsonb),
    (v_company_id, 'evaluaciones.historial', '{"deny":[],"rules":[{"all":[]}]}'::jsonb),
    -- Ver a todos los empleados + ranking: nivel 4 o admin.
    (v_company_id, 'evaluaciones.ver_todo', '{"deny":[],"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb),
    -- Recalcular un mes cerrado (backfill/fix de fórmula): nivel 4 o admin.
    (v_company_id, 'evaluaciones.recalcular', '{"deny":[],"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb),
    -- Configurar los perfiles de peso por cargo: nivel 4 o admin.
    (v_company_id, 'evaluaciones.perfiles.manage', '{"deny":[],"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
  on conflict (company_id, module_key) do nothing;
end $$;
