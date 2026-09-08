import { GoogleGenAI } from '@google/genai'
import { supabase } from './_lib/supabase.js'
import { requireUser } from './_lib/requireUser.js'
import { canAccessModule } from '../../src/lib/permissions.js'
import { loadCompanyInputs, loadHistoryByUser } from './employee-scores-snapshot.js'
import { computeAllEmployeeScores } from '../../src/utils/employeeScore.js'
import { buildScoreNarrative } from '../../src/utils/employeeScoreNarrative.js'
import { resolveProfile } from '../../src/utils/employeeScoreProfiles.js'
import { monthIndex } from '../../src/components/tareas/constants.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

// Análisis IA sobre la Evaluación automática de desempeño (score 0-100, ver
// ARQUITECTURA.md §2.7, fase F5). Reemplaza el análisis sobre respuestas 1-5 del
// flujo manual (retirado en F6): ya no recibe evaluation_sessions/responses, sino
// el mismo payload que ve el empleado en pantalla (score, breakdown, narrativa
// determinística, serie de los últimos meses).
const SYSTEM_INSTRUCTION = `
You will receive the automated performance score (0-100) of one employee for the current month: the 9 weighted indicators that make up the score (some may not apply to this employee's role — never mention an indicator whose "aplica" is false), a deterministic narrative summary already computed for this month, and the score series of the last few months.

The response must be in JSON format where the keys are in english but the values are in spanish. Return a JSON object with the keys: 'summary', 'strengths', 'weaknesses', 'recommendations'. 'summary' is a string; the other three are arrays of strings. If you can't provide information for a key, return for summary: "No se puede proporcionar información", and for the array keys: ["No se puede proporcionar información"].

Only discuss indicators where "aplica" is true — never invent a judgment about an indicator that doesn't apply to this role. Base strengths/weaknesses on the indicators with the highest/lowest "pct", and on the trend shown in the monthly series. Give insights about why each point matters, not just the raw number — for example: "El empleado cumple casi todas sus entregas a tiempo, lo que reduce el riesgo de atrasos en cascada para el resto del equipo." Recommendations must be concrete and actionable, tied to the weakest applicable indicators.

Never cite the "reuniones" (asistencia a reuniones) indicator as a strength, weakness, or recommendation, even if it has the highest or lowest "pct" — it reflects whether a meeting was marked "realizada" by whoever organized it, not attendance behavior by the employee being evaluated, so it is not actionable advice for this person. You may still mention it neutrally in the summary if relevant, but never as a "strengths", "weaknesses", or "recommendations" item.
`

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  if (!process.env.GEMINI_API_KEY) return json(500, { error: 'IA no configurada' })

  const { error: authError, caller } = await requireUser(event)
  if (authError) return authError

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const { employeeId } = body
  if (!employeeId) return json(400, { error: 'employeeId es requerido' })

  // Verificación de tenant: el service-role de abajo bypassa RLS, así que esto es
  // obligatorio (ver hallazgo 1.9 de plan.md).
  const { data: employee, error: empErr } = await supabase
    .from('users')
    .select('user_id, company_id, first_name, last_name, position:positions(position_name)')
    .eq('user_id', employeeId)
    .single()

  if (empErr || !employee) return json(404, { error: 'Empleado no encontrado' })
  if (employee.company_id !== caller.company_id) return json(403, { error: 'Forbidden' })

  // Autorización: el propio empleado, o quien tenga la capability
  // 'evaluaciones.ver_todo' (nivel 4/admin, o configurada más abajo por el
  // administrador — mismo mecanismo config-driven que el resto de la app).
  const isSelf = employeeId === caller.user_id
  if (!isSelf) {
    const { data: fullCaller, error: callerErr } = await supabase
      .from('users')
      .select('user_id, admin, access_level, department_id, position_id, company_id')
      .eq('user_id', caller.user_id)
      .single()
    if (callerErr || !fullCaller) return json(401, { error: 'Unauthorized' })

    if (!fullCaller.admin) {
      const { data: permRow, error: permErr } = await supabase
        .from('module_permissions')
        .select('rules')
        .eq('company_id', fullCaller.company_id)
        .eq('module_key', 'evaluaciones.ver_todo')
        .maybeSingle()
      if (permErr) return json(500, { error: 'Error verificando permisos' })

      const configByModule = { 'evaluaciones.ver_todo': permRow?.rules ?? null }
      if (!canAccessModule('evaluaciones.ver_todo', fullCaller, configByModule)) {
        return json(403, { error: 'Forbidden' })
      }
    }
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const period = { year, month, monthIdx: monthIndex(now) }

  let inputs
  let historyByUser
  try {
    ;[inputs, historyByUser] = await Promise.all([
      loadCompanyInputs(employee.company_id),
      loadHistoryByUser(employee.company_id, year, month),
    ])
  } catch (err) {
    return json(500, { error: err.message })
  }

  const employeeRow = inputs.users.find((u) => u.user_id === employeeId)
  if (!employeeRow) return json(404, { error: 'Empleado no encontrado' })

  const scores = computeAllEmployeeScores([employeeRow], inputs, inputs.profiles, period)
  const result = scores.get(employeeId)

  if (result.score == null) {
    return json(400, { error: 'El empleado no tiene datos suficientes este mes para un análisis' })
  }

  const history = historyByUser.get(employeeId) ?? []
  const narrativa = buildScoreNarrative(result, history)
  const profile = resolveProfile(employeeRow, inputs.profiles)

  const serie3Meses = [...history]
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
    .map((h) => ({ year: h.year, month: h.month, score: h.score, estado: h.estado }))
  serie3Meses.push({ year, month, score: result.score, estado: result.estado })

  const payload = {
    empleado: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
    cargo: employee.position?.position_name ?? profile?.name ?? '—',
    perfilPesos: profile?.weights ?? {},
    score: result.score,
    estado: result.estado,
    breakdown: result.breakdown.map((b) => ({
      key: b.key,
      label: b.label,
      aplica: b.aplica,
      pct: b.pct,
      pesoBase: b.pesoBase,
      pesoEfectivo: b.pesoEfectivo,
    })),
    narrativa,
    serie3Meses,
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        'I need an analysis of this employee performance based on their automated score data: ' +
        JSON.stringify(payload),
      config: {
        maxOutputTokens: 5000,
        temperature: 1,
        responseMimeType: 'application/json',
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    })

    if (!response.text) throw new Error('Sin respuesta de texto de Gemini')

    const parsed = JSON.parse(response.text)
    return json(200, parsed)
  } catch (err) {
    console.error('Error Gemini:', err)
    return json(502, { error: 'Error al generar el análisis' })
  }
}
