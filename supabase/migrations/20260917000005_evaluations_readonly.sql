-- F6 de la Evaluación automática de desempeño (ver ARQUITECTURA.md §2.7): retiro
-- del flujo manual. Cero borrado de datos — evaluation_sessions, evaluation_responses,
-- evaluation_comments y questions/question_positions/question_tags quedan íntegras
-- para consulta (Historial, solo lectura). Esta migración solo revoca la ESCRITURA
-- desde `authenticated`: nadie vuelve a crear/editar/borrar una evaluación manual ni
-- una pregunta desde la app. Solo `service_role` puede escribir (bypassa RLS, sin
-- policy explícita necesaria).
--
-- Las policies de SELECT se mantienen (mismo alcance de antes), salvo que se
-- actualiza la capability referenciada: 'evaluaciones.empleados' se retiró de
-- src/config/modules.js (ya no es configurable desde Empresa → Permisos) en favor
-- de 'evaluaciones.ver_todo', que ya cubre el mismo caso (nivel 4/admin, o quien se
-- configure) para el score automático.

-- ── evaluation_sessions ──────────────────────────────────────────────────────
drop policy if exists "evaluation_sessions_insert" on public.evaluation_sessions;
drop policy if exists "evaluation_sessions_delete" on public.evaluation_sessions;
drop policy if exists "evaluation_sessions_select" on public.evaluation_sessions;

create policy "evaluation_sessions_select"
on public.evaluation_sessions
for select
to authenticated
using (
  employee_id = auth.uid()
  or manager_id = auth.uid()
  or public.user_can('evaluaciones.ver_todo')
);

-- ── evaluation_responses ─────────────────────────────────────────────────────
drop policy if exists "evaluation_responses_insert" on public.evaluation_responses;
drop policy if exists "evaluation_responses_select" on public.evaluation_responses;

create policy "evaluation_responses_select"
on public.evaluation_responses
for select
to authenticated
using (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_responses.evaluation_id
      and (
        es.employee_id = auth.uid()
        or es.manager_id = auth.uid()
        or public.user_can('evaluaciones.ver_todo')
      )
  )
);

-- ── evaluation_comments ───────────────────────────────────────────────────────
drop policy if exists "evaluation_comments_insert" on public.evaluation_comments;
drop policy if exists "evaluation_comments_select" on public.evaluation_comments;

create policy "evaluation_comments_select"
on public.evaluation_comments
for select
to authenticated
using (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_comments.evaluation_id
      and (
        es.employee_id = auth.uid()
        or es.manager_id = auth.uid()
        or public.user_can('evaluaciones.ver_todo')
      )
  )
);

-- ── questions / question_positions / question_tags ────────────────────────────
-- Existían para armar el formulario del flujo manual (EvaluationModal /
-- QuestionsView). Sin flujo manual no hay formulario que llenar ni preguntas que
-- gestionar; se revoca la escritura por completo. SELECT se mantiene (Empresa →
-- Preguntas queda de solo lectura hasta que se decida qué hacer con ese tab, fuera
-- de alcance de esta migración).
drop policy if exists "Enable insert for authenticated users only" on public.questions;
drop policy if exists "Enable update for authenticated users only" on public.questions;
drop policy if exists "Enable delete for authenticated users only" on public.questions;

drop policy if exists "Enable insert for authenticated users only" on public.question_positions;
drop policy if exists "Enable update for authenticated users only" on public.question_positions;
drop policy if exists "Enable delete for authenticated users only" on public.question_positions;

drop policy if exists "Enable insert for authenticated users only" on public.question_tags;
drop policy if exists "Enable update for authenticated users only" on public.question_tags;
drop policy if exists "Enable delete for authenticated users only" on public.question_tags;
