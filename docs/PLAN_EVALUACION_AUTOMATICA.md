# Evaluación automática de desempeño por empleado

## Contexto

El módulo Evaluaciones de hoy es **manual**: un jefe abre `EvaluationModal.jsx`, responde preguntas 1–5 asignadas al cargo y eso produce un score 0–5. Depende por completo de que alguien se siente a evaluar, y en la práctica no se está usando — `aggregateUsageMonitor.js` excluye Evaluaciones de `USAGE_MODULES` con el comentario "ese módulo no se está usando hoy".

Al mismo tiempo, el sistema ya registra a diario todo lo que haría falta para medir desempeño real: tareas asignadas y cerradas, CNPs, tareas fijas semanales, piezas audiovisuales, reuniones, campañas y tickets. Está todo ahí, disperso, sin nadie que lo cruce por persona.

**Objetivo:** reemplazar el flujo manual por un **score 0–100 por empleado y mes que se calcula solo**, derivado exclusivamente de datos que ya existen. Ningún jefe responde nada sobre nadie. El historial manual se conserva como solo lectura.

Decisiones ya tomadas: reemplazo completo del flujo manual · fuentes = Tareas + CNP (núcleo), Tareas Fijas/Chequeo, Reuniones + Ads/Pautas, Tickets solo IT · mensual, congelado al día 5 (alineado con `metric_reports`) · cada quien ve el suyo, nivel 2/3 ve su línea, nivel 4/admin ve todo + ranking.

---

## Modelo de scoring

### Contrato de indicador

En `src/utils/employeeScore.js`, cada indicador es una función pura con la misma firma. **El indicador no conoce su peso**: devuelve qué tan bien lo hizo y si aplica; el peso lo decide el perfil de cargo.

```js
/** @returns {{ key, aplica: boolean, pct: number|null, unidades: number, detalle: object }} */
calcEntregas(ctx) // ctx = { userId, year, month, tasks, cnp, marks, clients, piezas,
//         meetings, campaigns, paidCampaigns, checks, tickets,
//         disponibilidad, weeks }
```

### Los 9 indicadores (pesos base, suman 100)

| key            | Indicador                | Peso | `aplica` si                           | `pct`                                     |
| -------------- | ------------------------ | ---- | ------------------------------------- | ----------------------------------------- |
| `entregas`     | Cumplimiento de entregas | 25   | `unidades ≥ 3`                        | tareas + CNP, 50/50 con redistribución    |
| `puntualidad`  | Entrega a tiempo         | 20   | `cerradasConFechas ≥ 3`               | `aTiempo / cerradasConFechas`             |
| `arrastre`     | No arrastre / no bloqueo | 10   | `unidades ≥ 3`                        | `max(0, 1 − ratio/0.5)`                   |
| `tareas_fijas` | Tareas fijas por rol     | 15   | `metaCeldas ≥ 4`                      | `0.6·cumplimiento + 0.4·puntualidadMarca` |
| `piezas_av`    | Piezas audiovisuales     | 10   | `asignadas ≥ 3`                       | `listo / asignadas`                       |
| `reuniones`    | Asistencia a reuniones   | 5    | `convocadasPorTerceros ≥ 2`           | `realizadas / convocadas`                 |
| `campanas`     | Campañas con resultados  | 5    | `campañas ≥ 1`                        | 2 sub-fuentes con redistribución          |
| `chequeo`      | Chequeo de plataformas   | 5    | `semanasEsperadas ≥ 2`                | `chequeadas / esperadas`                  |
| `tickets`      | Tickets IT en SLA        | 5    | `asignados ≥ 3` y `department_id = 0` | `resueltosEnSLA / asignados`              |

**`entregas`** — dos sub-fuentes 50/50, y si una tiene universo 0 la otra toma el 100% (patrón exacto de `calcSolicitudes` en `src/utils/metricsScore.js:113`). Tareas: `assignee_ids ∋ userId` + `taskInMonth`, `pct = isClosed/universo`. CNP: `assignee_id = userId`, no borrados, `cnpInMonth`, ponderado por piezas (`cnpPieceCount`/`cnpPiecesDelivered`).

**`puntualidad`** — reusa la lógica ya probada de `aggregateTaskMetrics` (`daysBetween(due_date, closed_date) ≤ 0`). CNP no tiene `closed_date` → migración F1 lo agrega con trigger server-side (no falsificable desde el cliente).

**`arrastre`** — único indicador de castigo, por eso pesa poco: `ratio = (isDragged + isBlocked)/universo`; 0% → 1.0, ≥50% → 0.

**`tareas_fijas`** — resuelve el doble conteo actual (hoy `MiPerfilV2View.jsx:207` acredita las 4 tareas completas tanto al social manager como al diseñador del cliente):

```js
export const FIXED_TASK_ROLE = {
  metricas: 'social',
  grilla: 'social',
  calendario: 'social',
  artes: 'designer',
}
```

`audiovisual_ids` y `apoyo_ids` **no entran** aquí (esos roles no producen ninguna de las 4 entregas); su señal vive en `piezas_av` y `entregas`. El desglose lo dice explícitamente en vez de mostrar un 0.

Además, **meta derivada del calendario, no de las marcas existentes**: `aggregateEmployeeFixedTasks` (`src/utils/fixedTasks.js:179`) hoy solo cuenta marcas que existen, así que quien nunca marcó nada sale "sin datos" en lugar de 0% — sobrevaloración. La función nueva reusa el patrón de `computeProductividad` (`fixedTasks.js:148`): `buildFixedWeeks` × `tasksForWeek` × `taskAppliesToClient`, descontando `na`. Celda sin marca = no cumplida.

**`campanas`** — `paid_campaigns.responsable_id` finalizadas: `1 − (results_pending/total)`. Señal fuerte porque `results_pending` **lo pone el cron de autoclose**, no la persona. Más `campaigns` orgánicas por promedio de checklist.

**`reuniones`** — solo donde `attendee_ids ∋ userId` **y** `created_by ≠ userId`. `cancelada` sale del denominador.

### Orquestador y redistribución

```js
export function computeEmployeeScore(ctx, weights)
// 1. corre los 9 indicadores
// 2. aplicables = aplica===true && weights[key] > 0
// 3. pesoEfectivo_i = weights[key] * (100 / Σ pesos de aplicables)
// 4. score = Σ pct_i * pesoEfectivo_i  (cap 100)
// → { score: number|null, estado, breakdown[], disponibilidad, cobertura, enRanking }
```

**Guardas de volumen mínimo** → `score: null`, `estado: 'sin_datos'`, UI "Sin datos suficientes este mes":

- Σ pesos base de aplicables < 50, **o**
- unidades totales < 8 (tareas + piezas CNP + celdas fijas + piezas AV), **o**
- menos de 2 indicadores aplicables.

Un 100 sacado de 2 tareas es peor que no dar número.

### Perfiles de peso por cargo

Tabla `employee_score_profiles`. Resolución por especificidad: `position_ids` > `department_ids` > `min_level` > `is_default`. `weights = { [key]: number }`; **peso 0 = nunca aplica a ese cargo** (distinto de "no hubo datos"). No necesitan sumar 100 — la redistribución normaliza siempre.

| Perfil                 | entregas | puntual. | arrastre | fijas | av  | reuniones | campañas | chequeo | tickets |
| ---------------------- | -------- | -------- | -------- | ----- | --- | --------- | -------- | ------- | ------- |
| Default                | 25       | 20       | 10       | 15    | 10  | 5         | 5        | 5       | 0       |
| Redes / Social         | 25       | 20       | 10       | 20    | 0   | 5         | 10       | 10      | 0       |
| Diseño                 | 30       | 25       | 10       | 25    | 5   | 5         | 0        | 0       | 0       |
| Audiovisual            | 25       | 20       | 10       | 0     | 35  | 5         | 0        | 0       | 0       |
| Marketing / Ads        | 25       | 20       | 10       | 0     | 0   | 10        | 35       | 0       | 0       |
| IT (`department_id=0`) | 25       | 20       | 10       | 0     | 0   | 5         | 0        | 0       | 40      |
| Dirección / Admin      | 35       | 30       | 15       | 0     | 0   | 20        | 0        | 0       | 0       |

**Por qué esto no viola "sin intervención del jefe":** el perfil describe _qué produce un cargo_, no _qué tan bien lo hizo una persona_. Se configura una vez, aplica igual a todos los que ocupan ese cargo, y es auditable. El matcheo por `user_ids` existe en el esquema pero **queda fuera de la UI** en esta versión, justamente para no abrir esa puerta.

### Ausencias, ingresos y probación

`src/utils/employeeAvailability.js` → `computeAvailability(user, vacations, year, month)` → `{ habilesMes, habilesDisponibles, factor, motivo, rangosExcluidos }`. Solo `vacations.status = 'confirmed'` descuenta (`tentative` no), vía `vacationDays()` de `employeeCalendar.js`.

Doble uso complementario:

1. **Filtro fino** — los ítems con `due_date` dentro de un rango excluido salen del universo de `entregas`/`puntualidad`/`arrastre`. Más justo que prorratear un denominador global.
2. **Marca de mes parcial** — `factor < 0.5` → `estado: 'parcial'`, `enRanking: false`, badge. El score se ve pero no compite.

`on_probation = true` → score visible, `enRanking: false`. No se compara a alguien en rodaje contra el equipo consolidado.

### Anti-gaming

| Señal                        | Riesgo                   | Mitigación                                                                                                                                                                              |
| ---------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.status` manual        | Cerrar sin entregar      | Nunca se puntúa **volumen**, solo cumplimiento sobre lo asignado. `autoCirculoPct` = ítems donde `created_by = assignee`; > 60% → `enRanking: false` + badge, y el % se muestra siempre |
| `due_date` editable          | Correr la fecha          | Se acompaña de `avgResolutionDays` (`request_date → closed_date`), que no se mueve al editar el vencimiento                                                                             |
| `fixed_task_marks.marked_by` | Marcar "sí" sin entregar | 40% del indicador es puntualidad de marca (`marked_at` vs `taskDeadline`), difícil de simular retroactivo. Y la meta es del calendario: no se sube el score dejando de marcar           |
| `meetings.status`            | Marcar todo realizada    | Peso 5, y solo reuniones convocadas por terceros                                                                                                                                        |
| **No manipulables**          | —                        | `paid_campaigns.results_pending` (cron), `support_tickets` (FK + SLA server-side), `av_pauta_piezas.status` (trigger)                                                                   |

---

## Arquitectura técnica

### Dónde vive el cálculo

**Netlify Scheduled Function que importa el mismo JS puro.** Una sola fórmula, dos modos de ejecución:

- **Mes en curso** → el navegador calcula en vivo. Nada que congelar.
- **Meses cerrados** → se lee `employee_score_snapshots`. Si falta la fila, la UI llama al mismo endpoint on-demand (`POST /api/employee-scores-snapshot`, capability `evaluaciones.recalcular`). Idempotente por `unique(user_id, year, month)`.

Es la primera scheduled function del repo: `netlify.toml` → `schedule = "0 12 5 * *"` (08:00 Caracas del día 5, después del cron de autoclose de 07:30). Escribe igual en `notif_cron_runs` para no perder la observabilidad unificada.

### Esquema

```sql
create table public.employee_score_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id text not null, name text not null,
  priority int not null default 0,
  match jsonb not null default '{}',     -- {position_ids[], department_ids[], min_level}
  weights jsonb not null,
  is_default boolean not null default false,
  updated_at timestamptz default now(), updated_by text
);

create table public.employee_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null, user_id text not null,
  year int not null, month int not null,
  score numeric(5,2),                    -- null = sin datos suficientes
  estado text not null check (estado in ('ok','parcial','sin_datos')),
  breakdown jsonb not null,
  disponibilidad numeric(4,3) not null default 1,
  auto_circulo_pct numeric(4,3),
  en_ranking boolean not null default true,
  profile_id uuid references employee_score_profiles(id), profile_name text,
  narrativa text,
  computed_at timestamptz not null default now(), computed_by text,
  frozen boolean not null default true,
  unique (user_id, year, month)
);
create index on employee_score_snapshots (company_id, year, month);
```

Trigger `employee_score_snapshots_prevent_edit` calcado de `metric_reports_prevent_closed_edit` (`20260715185715`), con bypass `service_role` (patrón de `20260908000000_service_role_bypass_users_trigger.sql`) para poder recomputar tras un fix de fórmula.

**RLS de SELECT** — implementa exactamente la visibilidad acordada, reusando los helpers SECURITY DEFINER que ya existen:

```sql
using (
  user_id = auth.uid()::text                       -- el propio
  or user_can('evaluaciones.ver_todo')             -- nivel 4 / admin
  or (task_user_access_level() >= 2 and exists (   -- nivel 2-3: su línea
        select 1 from public.metric_line_members mlm
         where mlm.user_id = employee_score_snapshots.user_id
           and task_user_in_line(mlm.line_id::text)))
)
```

Sin políticas de INSERT/UPDATE para `authenticated` → deny by default; solo service-role escribe.

### Carga de datos

Hoy `MiPerfilV2View` hace `select('*')` de `tasks` de toda la empresa. Cruzar 9 tablas × N empleados así no escala. **Una RPC, un roundtrip por mes:**

```sql
create function public.employee_score_inputs(p_year int, p_month int)
returns jsonb language plpgsql security definer stable
-- solo las columnas que los indicadores usan, solo del mes ±1 (taskInMonth cruza meses),
-- solo de los empleados que el caller puede ver (mismo predicado que la RLS de arriba)
```

`src/hooks/useEmployeeScores.js` decide la rama (snapshot vs en vivo), indexa cada colección por `userId` una sola vez y cada empleado consume su slot → O(N+M), sin N+1.

### Rutas, tabs y capabilities

|                                    |                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rutas**                          | `/evaluaciones` (Desempeño: lista + ranking) · `/evaluaciones/mi-desempeno` · `/evaluaciones/empleado/:id` · `/evaluaciones/historial`                              |
| **Redirects**                      | `/evaluaciones/resumen` y `/evaluaciones/perfil-v2` → `/evaluaciones`; `/evaluaciones/perfil` → `/evaluaciones/mi-desempeno`                                        |
| **Tabs** (`src/config/modules.js`) | `desempeno`, `mi-desempeno`, `historial`                                                                                                                            |
| **Capabilities nuevas**            | `evaluaciones.desempeno`, `evaluaciones.mi-desempeno`, `evaluaciones.historial`, `evaluaciones.ver_todo`, `evaluaciones.recalcular`, `evaluaciones.perfiles.manage` |
| **Se retira**                      | `evaluaciones.manage`                                                                                                                                               |
| **Sidebar**                        | Reemplazar el `access_level >= 2                                                                                                                                    |     | admin`hardcodeado de`Sidebar.jsx:250`por`can('evaluaciones.desempeno')`, consistente con el resto del sistema |

### Archivos

**Nuevos:** `src/utils/employeeScore.js` · `employeeScoreProfiles.js` · `employeeAvailability.js` · `employeeScoreNarrative.js` · `src/hooks/useEmployeeScores.js` · `src/components/evaluaciones/{DesempenoView,MiDesempenoView,ScoreBreakdownCard,IndicatorRow,HistorialLegacyView}.jsx` · `src/components/empresa/ScoreProfilesPanel.jsx` · `netlify/functions/employee-scores-snapshot.js` · 5 migraciones.

**Modificados:** `EvaluacionesPage.jsx` · `main.jsx` · `config/modules.js` · `Sidebar.jsx` · `utils/fixedTasks.js` (+`aggregateEmployeeFixedTasksByRole`) · `AiEvaluation.jsx` · `netlify/functions/evaluation-analysis.js` · `netlify.toml` · `ARQUITECTURA.md` · `src/data/changelog.js`.

**Eliminados (código, nunca datos):** `EvaluationModal.jsx`, `EmployeeEvalList.jsx`, `SummaryView.jsx`, `MiPerfilView.jsx`, `MiPerfilV2View.jsx` (su contenido útil se absorbe en `MiDesempenoView`). Se conservan `EmployeeProfileView.jsx` y `aggregateEvaluationSummary.js` dentro de `HistorialLegacyView`.

### Narrativa e IA

Primero la **narrativa determinística** (`employeeScoreNarrative.js`, estilo `usageNarrative.js`: siempre presente, sin costo, sin alucinación posible — _"bajaste en puntualidad respecto a tu promedio de 3 meses; tu punto más fuerte es tareas fijas"_). Debajo, botón opcional "Análisis con IA": `evaluation-analysis.js` deja de recibir respuestas 1–5 y pasa a recibir `{ empleado, cargo, perfilPesos, score, estado, breakdown, narrativa, serie3Meses }`. La narrativa se persiste al congelar; la IA nunca se persiste (igual que hoy).

---

## Fases

Cada fase es entregable, con tests verdes antes de cerrarla. Nada existente se rompe hasta F6.

**F0 — Núcleo puro** (sin UI, sin DB). `employeeScore.js`, `employeeScoreProfiles.js`, `employeeAvailability.js`, `fixedTasks.js` (+ función por rol).
Tests: un caso feliz + un `aplica:false` + un borde por indicador; redistribución (los pesos siempre suman 100 sobre aplicables, peso 0 nunca redistribuye hacia sí); disponibilidad (vacaciones a caballo entre meses, `hire_date` a mitad de mes, `tentative` no descuenta); atribución por rol (el mismo cliente **no** acredita `artes` al social manager ni `grilla` al diseñador; celda sin marca = incumplida).

**F1 — Base de datos.** Las 5 migraciones: tablas + trigger de inmutabilidad + RLS + seed de los 7 perfiles + RPC `employee_score_inputs` + `cnp_requests.closed_date` con trigger + capabilities.
Verificación: RLS no se testea con vitest → matriz de 3 usuarios (nivel 1, 3, 4) × 3 escenarios vía MCP de Supabase en dev.

**F2 — Vista en vivo del mes en curso.** Hook, `DesempenoView`, `MiDesempenoView`, `ScoreBreakdownCard`, `IndicatorRow`, rutas, tabs, Sidebar.
Hecho cuando: un empleado ve su score del mes con los 9 indicadores y sus pesos efectivos; nivel 3 ve su línea; nivel 4 ve el ranking. Las rutas viejas siguen vivas en paralelo.

**F3 — Snapshot mensual.** Scheduled function (modo `scheduled` día 5 + modo on-demand para backfill), rama de lectura de snapshots en el hook.
Tests sobre la lógica pura extraída (`buildSnapshotRows`): idempotencia, `deleted_at` excluidos, `estado` correcto. Hecho cuando: backfill de 3 meses en dev y el trigger rechaza un UPDATE desde `authenticated`.

**F4 — Configuración de perfiles en Empresa.** `ScoreProfilesPanel.jsx` con preview en vivo de a qué empleados matchea cada perfil. Hecho cuando: cambiar un peso se refleja en el mes en curso y **no** altera ningún snapshot congelado.

**F5 — Narrativa + IA repuntada.** Tests de determinismo (mismo input → mismo texto; nunca menciona un indicador que no aplica).

**F6 — Retiro del flujo manual + historial legacy.** Eliminar los componentes del flujo manual, `HistorialLegacyView` en solo lectura, redirects, y migración `..._evaluations_readonly.sql`.
**Cero borrado de datos:** `evaluation_sessions`, `evaluation_responses`, `evaluation_comments` y `questions*` quedan íntegras; la migración solo revoca INSERT/UPDATE/DELETE a `authenticated` (SELECT intacto) y retira `evaluaciones.manage`. Los scores nunca se mezclan: el manual era 0–5, el nuevo 0–100, en pestañas distintas y sin conversión.
Incluye actualizar `ARQUITECTURA.md` (§2.7 reescrita, §3.1 tablas nuevas + RPC, §4 conexiones, nota en §2.5) y acumular el ítem en `src/data/changelog.js` → `CHANGELOG[0]` (`1.2.0`, sin `date`, **no** se publica versión).

---

## Verificación

1. **Por fase:** `npx vitest run src/test/<archivos-tocados>` — solo los tests relacionados, nunca la suite completa durante la iteración.
2. **RLS (F1):** con el MCP de Supabase en dev, consultar `employee_score_snapshots` como usuario nivel 1, 3 y 4 y confirmar que cada uno ve exactamente su alcance.
3. **Sanidad del score (F2):** `npm run dev`, entrar como un empleado con datos reales del mes en curso y contrastar el desglose contra Tareas y CNP a mano — el número tiene que ser explicable línea por línea.
4. **Snapshot (F3):** disparar el endpoint on-demand para un mes cerrado, verificar la fila, re-disparar y confirmar idempotencia; intentar un UPDATE desde el cliente y confirmar que el trigger lo rechaza.
5. **Al final:** `npm test` una sola vez, con todo verde.

---

## Razonamiento del plan

**Indicadores con `aplica` + redistribución de peso, en vez de una fórmula fija.** La forma directa sería una suma ponderada fija de todas las señales. El problema es que ningún cargo genera todas: un editor audiovisual no toca tareas fijas, IT no toca campañas. Con pesos fijos, todos empiezan con puntos imposibles de ganar y el score mide _el cargo_, no _a la persona_. Se resuelve con el mismo mecanismo que ya usa `calcSolicitudes` (`metricsScore.js:130-135`), donde el peso de una fuente vacía pasa a la otra en vez de perderse — solo generalizado a 9 indicadores.

**Perfiles de peso por cargo en tabla, no constantes en el código.** La alternativa (constantes) obliga a un deploy cada vez que cambia un cargo, y hace invisible para el empleado por qué pesa lo que pesa. En tabla es auditable y configurable una sola vez. El riesgo obvio es que se convierta en una puerta trasera para ajustar el score de una persona: por eso el matcheo por `user_ids` queda fuera de la UI, y solo se puede configurar por cargo o departamento.

**Snapshot con Netlify Scheduled Function en vez de pg_cron.** Toda la infra de cron del repo es pg_cron, así que lo consistente sería SQL. Pero los indicadores dependen de `buildFixedWeeks` (semana ancla miércoles), `tasksForWeek`, `taskDeadline` (n-ésimo día hábil) y cálculo de días hábiles con vacaciones: portar eso a plpgsql son cientos de líneas de lógica de calendario duplicada, y `ARQUITECTURA.md §4` ya documenta la doble fuente de verdad como el problema conocido del sistema. Divergiría al primer ajuste de fórmula. `employeeScore.js` es ESM puro sin DOM ni Supabase, así que la función lo importa tal cual: **una fórmula, dos modos de ejecución**. El costo es introducir un tipo de job nuevo en el repo, mitigado escribiendo igual en `notif_cron_runs` y validando el schedule en preview antes de confiarle el día 5.

**`score: null` en vez de un número cuando hay pocos datos.** Lo directo es mostrar siempre un porcentaje. Pero con 2 tareas cerradas el score salta entre 0 y 100 por una sola tarea, y esa cifra va a terminar en una conversación sobre el sueldo de alguien. Es preferible declarar "sin datos suficientes" que publicar un número que no aguanta.

**Meta de tareas fijas derivada del calendario, no de las marcas existentes.** El código actual (`aggregateEmployeeFixedTasks`) solo cuenta celdas que alguien marcó, así que quien no marcó nada aparece sin datos en lugar de con 0% — el indicador premia no usar el sistema. Reusando el patrón de `computeProductividad` (`fixedTasks.js:148`) la meta sale del calendario y de la config del cliente, y una celda sin marcar cuenta como incumplida.

---

## Riesgos conocidos

1. **`cnp_requests.closed_date`** se agrega con trigger sobre una tabla en uso: las filas existentes quedan en `null` y no aportan a puntualidad hasta que se cierren CNPs nuevos. La alternativa (backfill desde `updated_at`) sería inventar datos.
2. **Independientes / Alta Gerencia** no persisten membresía en `metric_line_members`, así que la RLS de nivel 2/3 no los alcanza — verlos requiere `evaluaciones.ver_todo`. Coherente con cómo el resto del sistema trata esos grupos.
3. **`tasks.company_id` es `text` y `users.company_id` es `uuid`** → la RPC necesita el cast explícito que ya usan otras migraciones.
4. Detectado de paso, fuera de alcance: `20260904000000_metric_reports_autoclose_disable.sql` tiene prefijo **anterior** a `20260912000000_metric_reports_autoclose.sql`, así que un replay desde cero por orden de archivo dejaría el autoclose **encendido**. Vale la pena arreglarlo, pero no es parte de este trabajo.
