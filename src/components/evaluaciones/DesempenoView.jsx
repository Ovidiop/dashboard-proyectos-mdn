import { useState } from 'react'
import Avatar from '../Avatar'
import MonthPeriodPicker, { thisMonthStr, monthStrToDate } from '../common/MonthPeriodPicker'
import { scoreDialColor } from '../metricas/ScoreDial'
import ScoreBreakdownCard from './ScoreBreakdownCard'
import { useEmployeeScores } from '../../hooks/useEmployeeScores'

const ESTADO_BADGE = {
  parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sin_datos: { label: 'Sin datos', cls: 'bg-[#f0ede3] text-[#888] border-[#e0ddd4]' },
}

function fullName(u) {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—'
}

/**
 * "Desempeño": lista de empleados + ranking del mes (nivel 2+ — la RLS/RPC ya acota
 * a quienes cada nivel puede ver: su línea para nivel 2-3, todos para nivel 4/admin).
 * Reemplaza al tab "Empleados" del flujo manual (ver ARQUITECTURA.md §2.7).
 */
export default function DesempenoView() {
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const [expandedId, setExpandedId] = useState(null)
  const date = monthStrToDate(selectedMonth)
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const { loading, error, scores, users, isSnapshot } = useEmployeeScores({ year, month })

  const rows = users
    .map((u) => ({ user: u, result: scores.get(u.user_id) }))
    .filter((r) => r.result)
    .sort((a, b) => {
      const sa = a.result.score ?? -1
      const sb = b.result.score ?? -1
      return sb - sa
    })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthPeriodPicker value={selectedMonth} onChange={setSelectedMonth} />
        {isSnapshot && (
          <span className="text-[12.5px] text-[#999] font-mono">
            Mes cerrado — puntaje congelado
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-[14.5px] text-[#888] py-8 text-center">
          No hay empleados con datos suficientes en este período.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] divide-y divide-[#f0ede3] overflow-hidden">
          {rows.map(({ user, result }) => {
            const badge = ESTADO_BADGE[result.estado]
            const isOpen = expandedId === user.user_id
            return (
              <div key={user.user_id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : user.user_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#fafaf7] transition-colors"
                >
                  <Avatar user={user} size={32} />
                  <span className="flex-1 text-[14.5px] font-semibold text-[#111] truncate">
                    {fullName(user)}
                  </span>
                  {badge && (
                    <span
                      className={`text-[12px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  )}
                  <span
                    className="text-[18px] font-bold font-mono w-12 text-right"
                    style={{ color: result.score != null ? scoreDialColor(result.score) : '#bbb' }}
                  >
                    {result.score != null ? result.score.toFixed(1) : '—'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <ScoreBreakdownCard result={result} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
