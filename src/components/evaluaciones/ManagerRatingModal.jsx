import { useState, useEffect } from 'react'

/**
 * Formulario de la evaluación subjetiva mensual del jefe (ver ARQUITECTURA.md §2.7).
 * Una fila por criterio del cargo del empleado (1-5, mismo lenguaje visual que el
 * historial legacy en EmployeeProfileView.jsx) + un comentario libre.
 *
 * Props:
 *   employee   — {user_id, first_name, last_name, position_id}
 *   criteria   — criterios activos de su cargo, en orden ([] si el cargo no tiene)
 *   existing   — fila actual de manager_ratings para este empleado/mes, o null
 *   onClose    — callback para cerrar
 *   onSave     — async ({positionId, criteria, scoresById, comment}) => void
 */
export default function ManagerRatingModal({ employee, criteria, existing, onClose, onSave }) {
  const initialScores = Object.fromEntries(
    (existing?.items ?? []).map((i) => [i.criterion_id, i.score]),
  )
  const [scores, setScores] = useState(initialScores)
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const allScored = criteria.length > 0 && criteria.every((c) => scores[c.id] != null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allScored) {
      setError('Puntúa todos los criterios antes de guardar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        positionId: employee.position_id ?? null,
        criteria,
        scoresById: scores,
        comment,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const employeeName = `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <div>
            <h2 className="text-[18px] font-bold text-[#111]">Evaluación del mes</h2>
            {employeeName && <p className="text-[13.5px] text-[#888] mt-0.5">{employeeName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          id="manager-rating-form"
          onSubmit={handleSubmit}
          className="px-6 py-5 space-y-5 overflow-y-auto flex-1"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {criteria.length === 0 ? (
            <p className="text-[14.5px] text-[#888]">
              Este cargo todavía no tiene criterios de evaluación configurados.
            </p>
          ) : (
            criteria.map((c) => (
              <div key={c.id}>
                <div className="flex items-center gap-2 mb-1">
                  {c.icon && <span className="text-[15px]">{c.icon}</span>}
                  <label className="text-[14.5px] font-semibold text-[#111]">{c.name}</label>
                </div>
                {c.description && <p className="text-[13px] text-[#999] mb-2">{c.description}</p>}
                <div className="flex gap-1.5" role="radiogroup" aria-label={c.name}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={scores[c.id] === n}
                      onClick={() => setScores((s) => ({ ...s, [c.id]: n }))}
                      className={`w-9 h-9 rounded-lg text-[14px] font-bold border transition-colors ${
                        scores[c.id] === n
                          ? 'bg-[#FFB800] border-[#FFB800] text-[#111]'
                          : 'border-[#e0ddd4] text-[#999] hover:bg-[#f5f3eb]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Comentario
            </label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Contexto opcional sobre el desempeño de este mes…"
            />
          </div>
        </form>

        {/* Acciones */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="manager-rating-form"
            disabled={saving || criteria.length === 0}
            className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar evaluación'}
          </button>
        </div>
      </div>
    </div>
  )
}
