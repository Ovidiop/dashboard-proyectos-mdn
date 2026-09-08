import { useEffect } from 'react'
import ScoreBreakdownCard from './ScoreBreakdownCard'

function fullName(u) {
  return `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim() || '—'
}

/**
 * Detalle de desempeño de un empleado, abierto desde una fila de la tabla en
 * DesempenoView. Wrapper fino sobre ScoreBreakdownCard (no se duplica la ficha) que
 * agrega flechas ‹ › para recorrer la lista ya filtrada/ordenada que se está viendo
 * sin cerrar el modal — así comparar dos empleados no exige abrir y cerrar cada vez.
 *
 * `z-40`, deliberadamente por debajo del `z-50` de ManagerRatingModal: así se puede
 * abrir "Evaluar" desde aquí sin que este modal se cierre primero.
 *
 * @param {Array<{user:object, result:object}>} rows   lista ya filtrada/ordenada
 * @param {number} index                                índice actual dentro de `rows`
 * @param {Function} onNavigate                          (nextIndex) => void
 * @param {Function} onClose
 * @param {object} [managerRating]
 * @param {Array} [criteria]
 * @param {boolean} [canEvaluar]
 * @param {Function} [onEvaluar]
 */
export default function EmployeeScoreModal({
  rows,
  index,
  onNavigate,
  onClose,
  managerRating,
  criteria,
  canEvaluar,
  onEvaluar,
}) {
  const current = rows[index]

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < rows.length - 1) onNavigate(index + 1)
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose, onNavigate, index, rows.length])

  if (!current) return null
  const { user, result } = current

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3.5 border-b border-[#ece9df]">
          <button
            type="button"
            onClick={() => onNavigate(index - 1)}
            disabled={index === 0}
            aria-label="Empleado anterior"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M6 1L2 4l4 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-[14px] font-bold text-[#111] truncate">{fullName(user)}</p>
            <p className="text-[11.5px] font-mono text-[#999]">
              {index + 1} de {rows.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(index + 1)}
            disabled={index === rows.length - 1}
            aria-label="Empleado siguiente"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M2 1l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ScoreBreakdownCard
            result={result}
            employee={user}
            cargoLabel={user?.position?.position_name}
            managerRating={managerRating}
            criteria={criteria}
            canEvaluar={canEvaluar}
            onEvaluar={onEvaluar}
          />
        </div>
      </div>
    </div>
  )
}
