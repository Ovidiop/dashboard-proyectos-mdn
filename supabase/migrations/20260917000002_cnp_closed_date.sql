-- Agrega `closed_date` a cnp_requests para poder medir puntualidad (due_date vs
-- closed_date) en la Evaluación automática de desempeño — ver
-- src/utils/employeeScore.js#calcPuntualidad y ARQUITECTURA.md §2.7. Se setea
-- server-side vía trigger cuando `status` pasa a 'Terminado' (no falsificable desde
-- el cliente, a diferencia de un campo editable en el modal). Filas existentes
-- quedan en null: no se inventa una fecha de cierre retroactiva.
alter table public.cnp_requests
  add column if not exists closed_date date;

create or replace function public.set_cnp_closed_date()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'Terminado' and old.status is distinct from 'Terminado' then
    new.closed_date := current_date;
  elsif new.status is distinct from 'Terminado' and old.status = 'Terminado' then
    -- Reabrir un CNP cerrado limpia la fecha de cierre (mismo criterio que un cierre
    -- inválido: si ya no está Terminado, no tiene sentido conservar cuándo se cerró).
    new.closed_date := null;
  end if;
  return new;
end;
$function$;

create trigger trg_set_cnp_closed_date
  before update on public.cnp_requests
  for each row execute function public.set_cnp_closed_date();
