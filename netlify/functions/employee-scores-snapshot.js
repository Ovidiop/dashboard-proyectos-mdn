// Snapshot mensual de la Evaluación automática de desempeño (ver ARQUITECTURA.md
// §2.7). Dos modos, misma fórmula que el cálculo en vivo del cliente
// (src/utils/employeeScoreSnapshot.js, que reusa src/utils/employeeScore.js):
//
//  - Programado (Netlify Scheduled Function, ver netlify.toml): Netlify invoca esta
//    función el día 5 sin Authorization header. Congela el score del MES ANTERIOR
//    para todas las empresas activas.
//  - On-demand (POST autenticado, capability `evaluaciones.recalcular`): recibe
//    { year, month } y recalcula esa empresa/mes — para backfill o para recomputar
//    tras un fix de fórmula (el trigger de employee_score_snapshots ya deja pasar
//    updates de service_role, ver 20260917000000_create_employee_scores.sql).
//
// Corre con SERVICE ROLE (bypassa RLS) — por eso las consultas de abajo filtran
// manualmente por company_id, replicando el alcance de la RPC `employee_score_inputs`
// pero para TODOS los empleados de la empresa (no solo los visibles para un caller).
// No hay pre-filtro por rango de fechas: cada indicador de employeeScore.js ya acota
// por mes internamente, así que traer el histórico completo de una tabla no es
// incorrecto — solo evita duplicar la lógica de rangos de fechas en dos lenguajes.
import { supabase } from './_lib/supabase.js'
import { requireCapability } from './_lib/requireCapability.js'
import {
  buildSnapshotRows,
  previousMonthCaracas,
  priorPeriods,
} from '../../src/utils/employeeScoreSnapshot.js'
import { monthIndex } from '../../src/components/tareas/constants.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

const JOB_NAME = 'employee-scores-snapshot'

/** Exportada para `evaluation-analysis.js` (F5): mismo alcance de datos que el
 * snapshot mensual, reusado para armar el payload del análisis IA de un empleado. */
export async function loadCompanyInputs(companyId) {
  const [
    usersRes,
    clientsRes,
    tasksRes,
    cnpRes,
    marksRes,
    piezasRes,
    meetingsRes,
    paidRes,
    checksRes,
    ticketsRes,
    vacationsRes,
    profilesRes,
    allCampaignsRes,
  ] = await Promise.all([
    supabase
      .from('users')
      .select(
        'user_id, first_name, last_name, avatar_url, access_level, department_id, position_id, hire_date, on_probation, deleted_at',
      )
      .eq('company_id', companyId),
    supabase.from('metric_clients').select('*').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('tasks').select('*').eq('company_id', companyId),
    supabase.from('cnp_requests').select('*').eq('company_id', companyId),
    supabase.from('fixed_task_marks').select('*').eq('company_id', companyId),
    supabase.from('av_pauta_piezas').select('*').eq('company_id', companyId),
    supabase.from('meetings').select('*').eq('company_id', companyId),
    supabase.from('paid_campaigns').select('*').eq('company_id', companyId),
    supabase.from('publication_checks').select('*').eq('company_id', companyId),
    supabase.from('support_tickets').select('*').eq('company_id', companyId),
    supabase.from('vacations').select('*').eq('company_id', companyId),
    supabase.from('employee_score_profiles').select('*').eq('company_id', companyId),
    // `campaigns` no tiene company_id (a diferencia de paid_campaigns) — se filtra
    // abajo por `assignee` perteneciente a la empresa, igual que hace la RPC.
    supabase.from('campaigns').select('*'),
  ])

  for (const [name, res] of Object.entries({
    users: usersRes,
    clients: clientsRes,
    tasks: tasksRes,
    cnp: cnpRes,
    marks: marksRes,
    piezas: piezasRes,
    meetings: meetingsRes,
    paidCampaigns: paidRes,
    checks: checksRes,
    tickets: ticketsRes,
    vacations: vacationsRes,
    profiles: profilesRes,
    campaigns: allCampaignsRes,
  })) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`)
  }

  const users = usersRes.data ?? []
  const companyUserIds = new Set(users.map((u) => u.user_id))
  const campaigns = (allCampaignsRes.data ?? []).filter((c) => companyUserIds.has(c.assignee))

  return {
    users,
    clients: clientsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    cnp: cnpRes.data ?? [],
    marks: marksRes.data ?? [],
    piezas: piezasRes.data ?? [],
    meetings: meetingsRes.data ?? [],
    campaigns,
    paidCampaigns: paidRes.data ?? [],
    checks: checksRes.data ?? [],
    tickets: ticketsRes.data ?? [],
    vacations: vacationsRes.data ?? [],
    profiles: profilesRes.data ?? [],
  }
}

/** Historial de hasta 3 snapshots anteriores por empleado, para la narrativa
 * comparativa (`buildScoreNarrative`). No falla si aún no hay meses previos
 * congelados (lanzamiento reciente) — simplemente no hay con qué comparar. */
export async function loadHistoryByUser(companyId, year, month) {
  const periods = priorPeriods(year, month, 3)
  const or = periods.map((p) => `and(year.eq.${p.year},month.eq.${p.month})`).join(',')
  const { data, error } = await supabase
    .from('employee_score_snapshots')
    .select('user_id, year, month, score, estado, breakdown')
    .eq('company_id', companyId)
    .or(or)
  if (error) throw new Error(error.message)

  const byUser = new Map()
  for (const row of data ?? []) {
    const list = byUser.get(row.user_id) ?? []
    list.push({
      year: row.year,
      month: row.month,
      score: row.score == null ? null : Number(row.score),
      estado: row.estado,
      breakdown: row.breakdown,
    })
    byUser.set(row.user_id, list)
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
  }
  return byUser
}

/** Congela el score de una empresa/mes: carga datos, calcula, upsert. */
async function snapshotCompany(companyId, year, month, computedBy) {
  const [inputs, historyByUser] = await Promise.all([
    loadCompanyInputs(companyId),
    loadHistoryByUser(companyId, year, month),
  ])
  const period = { year, month, monthIdx: monthIndex(new Date(year, month - 1, 1)) }
  const rows = buildSnapshotRows(inputs.users, inputs, inputs.profiles, period, {
    companyId,
    computedBy,
    historyByUser,
  })
  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('employee_score_snapshots')
    .upsert(rows, { onConflict: 'user_id,year,month' })
  if (error) throw new Error(error.message)
  return rows.length
}

async function logRun({ notificationsInserted, errorsCount, errorSample, ok }) {
  await supabase.from('notif_cron_runs').insert({
    job_name: JOB_NAME,
    notifications_inserted: notificationsInserted,
    errors_count: errorsCount,
    error_sample: errorSample ?? null,
    ok,
  })
}

/** Modo programado: recorre todas las empresas y congela el mes anterior. Cada
 * empresa va en su propio try/catch (mismo patrón que enqueue_metric_report_closures
 * en SQL) para que una empresa con datos raros no tumbe a las demás. */
async function runScheduled() {
  const { year, month } = previousMonthCaracas()
  const { data: companies, error } = await supabase.from('companies').select('id')
  if (error) throw new Error(error.message)

  let totalRows = 0
  let errorsCount = 0
  let firstError = null

  for (const company of companies ?? []) {
    try {
      totalRows += await snapshotCompany(company.id, year, month, null)
    } catch (err) {
      errorsCount++
      firstError = firstError ?? `${company.id}: ${err.message}`
      console.error(`${JOB_NAME}: error en empresa ${company.id}`, err)
    }
  }

  await logRun({
    notificationsInserted: totalRows,
    errorsCount,
    errorSample: firstError,
    ok: errorsCount === 0,
  })

  return { year, month, companies: companies?.length ?? 0, rows: totalRows, errors: errorsCount }
}

export const handler = async (event) => {
  const isScheduled = !event.headers?.authorization && !event.headers?.Authorization

  if (isScheduled) {
    try {
      const result = await runScheduled()
      return json(200, result)
    } catch (err) {
      console.error(`${JOB_NAME}: fallo general`, err)
      await logRun({
        notificationsInserted: 0,
        errorsCount: 1,
        errorSample: err.message,
        ok: false,
      })
      return json(500, { error: err.message })
    }
  }

  // Modo on-demand: recalcular la empresa del caller para un mes específico.
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const { error: authError, caller } = await requireCapability(event, 'evaluaciones.recalcular')
  if (authError) return authError

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const year = Number(body.year)
  const month = Number(body.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return json(400, { error: 'year/month inválidos' })
  }

  try {
    const rows = await snapshotCompany(caller.company_id, year, month, caller.user_id)
    return json(200, { year, month, rows })
  } catch (err) {
    console.error(`${JOB_NAME}: fallo on-demand`, err)
    return json(500, { error: err.message })
  }
}
