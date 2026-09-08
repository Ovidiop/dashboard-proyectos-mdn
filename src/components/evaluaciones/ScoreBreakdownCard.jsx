import ScoreDial, { scoreDialColor } from '../metricas/ScoreDial'
import IndicatorRow from './IndicatorRow'

const ESTADO_LABEL = {
  ok: null,
  parcial: 'Mes parcial — no compite en el ranking',
  sin_datos: 'Sin datos suficientes este mes',
}

/**
 * Desglose completo del score de un empleado en un mes: dial 0-100 + una fila por
 * indicador. Usado tanto en "Mi Desempeño" (empleado viendo el suyo) como en el
 * detalle de un empleado ajeno desde el ranking (nivel 2+).
 *
 * @param {object} result  salida de computeEmployeeScore / fila de employee_score_snapshots
 */
export default function ScoreBreakdownCard({ result, employeeName }) {
  if (!result) return null

  const { score, estado, breakdown, disponibilidad, autoCirculoPct, narrativa } = result
  const badge = ESTADO_LABEL[estado]

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <ScoreDial
          score={score ?? 0}
          color={scoreDialColor(score ?? 0)}
          size={140}
          showScale={score != null}
        />
        <div className="flex-1 w-full">
          {employeeName && <p className="text-[15px] font-bold text-[#111] mb-1">{employeeName}</p>}
          {score == null ? (
            <p className="text-[14.5px] text-[#888] mb-3">
              Sin datos suficientes este mes — se necesita más volumen de tareas/CNP/tareas fijas
              para calcular un puntaje confiable.
            </p>
          ) : (
            badge && (
              <p className="inline-block text-[13px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mb-3">
                {badge}
              </p>
            )
          )}
          {disponibilidad < 1 && (
            <p className="text-[13px] text-[#999] mb-1">
              Disponibilidad del mes: {Math.round(disponibilidad * 100)}%
            </p>
          )}
          {autoCirculoPct != null && autoCirculoPct > 0.6 && (
            <p className="text-[13px] text-[#E14848] mb-1">
              {Math.round(autoCirculoPct * 100)}% de tus tareas/CNP fueron auto-asignadas — excluido
              del ranking.
            </p>
          )}
        </div>
      </div>

      {narrativa && score != null && (
        <p className="mt-5 pt-4 border-t border-[#e0ddd4] text-[14.5px] text-[#555] leading-relaxed">
          {narrativa}
        </p>
      )}

      {Array.isArray(breakdown) && breakdown.length > 0 && (
        <div
          className={`mt-5 ${narrativa && score != null ? '' : 'pt-4 border-t border-[#e0ddd4]'} divide-y divide-[#f0ede3]`}
        >
          {breakdown.map((b) => (
            <IndicatorRow
              key={b.key}
              label={b.label}
              pct={b.pct}
              pesoBase={b.pesoBase}
              pesoEfectivo={b.pesoEfectivo}
              aplica={b.aplica}
              unidades={b.unidades}
            />
          ))}
        </div>
      )}
    </div>
  )
}
