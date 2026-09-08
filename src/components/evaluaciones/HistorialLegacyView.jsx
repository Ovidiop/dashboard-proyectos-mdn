import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import getPastMonthRange from '../../utils/getPastMonthRange'
import { aggregateEvaluationSummary } from '../../utils/aggregateEvaluationSummary'

/**
 * "Historial": solo lectura del flujo manual de evaluaciones (0-5), retirado en
 * favor del score automático (ver ARQUITECTURA.md §2.7, fase F6). No hay crear ni
 * editar aquí — evaluation_sessions/responses/comments quedan intactas para
 * consulta, pero el RLS ya no permite escribirlas desde `authenticated`.
 */
export default function HistorialLegacyView({ companyId }) {
  const navigate = useNavigate()
  const { firstDay } = getPastMonthRange()

  // El selector de mes usa formato YYYY-MM (input[type=month])
  const defaultMonth = firstDay.slice(0, 7) // YYYY-MM

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    const periodParam = `${selectedMonth}-01`
    const { data, error: err } = await supabase
      .from('evaluation_sessions')
      .select(
        'total_score, ' +
          'employee:users!evaluation_sessions_employee_id_fkey!inner(' +
          'user_id, first_name, last_name, email, company_id, ' +
          'position:positions(position_name)), ' +
          'manager:users!manager_id(' +
          'user_id, first_name, last_name, email, ' +
          'position:positions(position_name))',
      )
      .eq('period', periodParam)
      .eq('employee.company_id', companyId)

    if (err) {
      setError(err.message)
    } else {
      setRows(aggregateEvaluationSummary(data ?? []))
    }
    setLoading(false)
  }, [companyId, selectedMonth])

  useEffect(() => {
    load()
  }, [load])

  function handleMonthChange(e) {
    setSelectedMonth(e.target.value)
  }

  function scoreColor(score) {
    if (score == null) return 'text-[#bbb]'
    if (score >= 4) return 'text-green-600'
    if (score >= 3) return 'text-[#b45309]'
    return 'text-red-600'
  }

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-[#999]">
        Historial del flujo manual de evaluaciones (0–5), retirado en favor del score automático de
        Desempeño. Solo lectura.
      </p>

      {/* Cabecera con selector de período */}
      <div className="flex items-center gap-3">
        <p className="text-[15px] text-[#888]">
          {rows.length} persona{rows.length !== 1 ? 's' : ''}
        </p>
        <label className="flex items-center gap-2 ml-auto">
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            Período
          </span>
          <input
            type="month"
            className="input-base py-1 text-[15px]"
            value={selectedMonth}
            onChange={handleMonthChange}
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">Sin datos</p>
          <p className="text-[15px] text-[#bbb]">
            No hay evaluaciones para el período seleccionado.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          {/* Grid único: header + filas comparten las mismas columnas */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center">
            {/* Cabecera — 5 celdas directas */}
            <span className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] bg-[#fafaf7] border-b border-[#f0ede3] px-5 py-2.5">
              Empleado
            </span>
            <span className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] bg-[#fafaf7] border-b border-[#f0ede3] px-5 py-2.5">
              Cargo
            </span>
            <span className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] text-right bg-[#fafaf7] border-b border-[#f0ede3] px-5 py-2.5">
              Recibidas
            </span>
            <span className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] text-right bg-[#fafaf7] border-b border-[#f0ede3] px-5 py-2.5">
              Hechas
            </span>
            <span className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] text-right bg-[#fafaf7] border-b border-[#f0ede3] px-5 py-2.5">
              Score
            </span>

            {/* Filas — cada fila son 5 celdas consecutivas */}
            {rows.map((row, idx) => {
              const isLast = idx === rows.length - 1
              const cellBase = `px-5 py-3 transition-colors hover:bg-[#fafaf7]${isLast ? '' : ' border-b border-[#f0ede3]'}`
              return [
                /* Nombre — clickeable al historial del empleado (EmployeeProfileView) */
                <button
                  key={`n${idx}`}
                  type="button"
                  onClick={() => navigate(`/evaluaciones/empleado/${row.user_id}`)}
                  className={`flex items-center gap-2.5 min-w-0 text-left ${cellBase}`}
                >
                  <span className="text-[13px] font-mono text-[#bbb] w-5 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-[#111] truncate">
                      {row.first_name} {row.last_name}
                    </p>
                    <p className="text-[13px] text-[#aaa] truncate">{row.email}</p>
                  </div>
                </button>,
                /* Cargo */
                <span
                  key={`c${idx}`}
                  className={`text-[14px] text-[#666] whitespace-nowrap ${cellBase}`}
                >
                  {row.position_name ?? '—'}
                </span>,
                /* Recibidas */
                <span
                  key={`r${idx}`}
                  className={`text-[15px] font-mono text-[#888] text-right tabular-nums ${cellBase}`}
                >
                  {row.received_count}
                </span>,
                /* Hechas */
                <span
                  key={`h${idx}`}
                  className={`text-[15px] font-mono text-[#888] text-right tabular-nums ${cellBase}`}
                >
                  {row.made_count}
                </span>,
                /* Score */
                <div key={`s${idx}`} className={`text-right flex-shrink-0 ${cellBase}`}>
                  <span className={`text-[20px] font-bold ${scoreColor(row.avg_score)}`}>
                    {row.avg_score?.toFixed(1) ?? '—'}
                  </span>
                  <span className="text-[13px] text-[#bbb] font-mono"> /5</span>
                </div>,
              ]
            })}
          </div>
        </div>
      )}
    </div>
  )
}
