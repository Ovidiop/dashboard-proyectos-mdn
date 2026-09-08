import { useState } from 'react'
import MonthPeriodPicker, { thisMonthStr, monthStrToDate } from '../common/MonthPeriodPicker'
import ScoreBreakdownCard from './ScoreBreakdownCard'
import { useEmployeeScores } from '../../hooks/useEmployeeScores'
import { useManagerRatings } from '../../hooks/useManagerRatings'

/**
 * "Mi Desempeño": el score automático del propio empleado, mes a mes (reemplaza a
 * Mi Perfil / Mi Perfil v2 del flujo manual, ver ARQUITECTURA.md §2.7) — cada quien
 * ve solo su propia ficha aquí; comparar contra el equipo es DesempenoView (nivel 2+).
 *
 * El panel operativo (tareas/proyectos/tareas fijas, portado de Mi Perfil v2) se
 * retiró: esa información ya vive en Tareas y en las fichas de Reportes; esta vista
 * se concentra en el score.
 */
export default function MiDesempenoView({ userId, companyId, positionId, employee, cargoLabel }) {
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const date = monthStrToDate(selectedMonth)
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const { loading, error, scores, isSnapshot } = useEmployeeScores({ year, month })
  const result = scores.get(userId)
  const { criteriaByPosition, ratings } = useManagerRatings({ year, month, companyId })

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

      {!loading && !error && (
        <ScoreBreakdownCard
          result={result}
          employee={employee}
          cargoLabel={cargoLabel}
          managerRating={ratings.get(userId)}
          criteria={criteriaByPosition.get(positionId) ?? []}
          canEvaluar={false}
        />
      )}
    </div>
  )
}
