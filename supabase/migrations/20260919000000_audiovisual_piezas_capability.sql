-- Nueva capability 'audiovisual.piezas': separa "gestionar piezas y editores de pautas
-- realizadas" (AttendeePicker de editores, checklist por pieza, desglose piezas
-- salieron/editadas) de "audiovisual.coordina" (agendar/declinar/marcar realizada/
-- editar fecha-recurso-asistentes), que quedó restringida a solo Lizdania + admins en
-- 20260827000000_audiovisual_coordina_restrict_lizdania.sql. Sin esta capability, el
-- resto del depto Audiovisual —quienes efectivamente editan las piezas— dependía de
-- pedirle todo a la coordinadora.
--
-- La coordinadora no necesita estar en esta regla: AudiovisualView.jsx compone
-- `canCoordinate || can('audiovisual.piezas')` en vez de duplicar su condición aquí.
--
-- Seed: todo el depto Audiovisual (department_id = 2), configurable después desde
-- Empresa → Permisos como cualquier otra capability (registrada en
-- src/config/modules.js → tareas.manageActions).
insert into public.module_permissions (company_id, module_key, rules)
select company_id, 'audiovisual.piezas',
  '{"rules":[{"all":[{"type":"department","value":null,"ids":[2]}]}]}'::jsonb
from public.module_permissions
where module_key = 'audiovisual.coordina'
on conflict (company_id, module_key) do update set rules = excluded.rules;
