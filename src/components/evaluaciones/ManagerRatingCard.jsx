import { format, parseISO } from 'date-fns'

/**
 * Evaluación subjetiva del jefe para un empleado/mes — solo lectura (ver
 * ARQUITECTURA.md §2.7). Una celda por criterio, estilo ficha técnica: emoji +
 * valor + nombre. Si el cargo no tiene criterios configurados, no se renderiza nada
 * (el bloque completo del jefe no aplica a ese cargo).
 *
 * Props:
 *   rating     — fila de manager_ratings del mes, o null/undefined si no evaluaron aún
 *   criteria   — criterios activos del cargo (para el estado "pendiente")
 *   canEvaluar — true si el usuario actual puede evaluar (capability) y no es él mismo
 *   onEvaluar  — callback para abrir el modal de evaluación
 *   caption    — texto del encabezado (por defecto "🗓️ Evaluación del jefe")
 */
export default function ManagerRatingCard({
  rating,
  criteria,
  canEvaluar,
  onEvaluar,
  caption = '🗓️ Evaluación del jefe',
}) {
  if (!criteria?.length) return null

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#999]">{caption}</p>
        {canEvaluar && (
          <button
            type="button"
            onClick={onEvaluar}
            className="text-[12.5px] font-semibold text-[#c99000] hover:text-[#a67800] transition-colors"
          >
            {rating ? 'Editar' : 'Evaluar'}
          </button>
        )}
      </div>

      {!rating ? (
        <p className="text-[13.5px] text-[#bbb]">Pendiente de evaluación este mes.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5">
            {(rating.items ?? []).map((item) => (
              <div
                key={item.criterion_id}
                className="bg-[#fafaf7] rounded-lg px-2 py-2.5 text-center"
              >
                {item.icon && <div className="text-[15px]">{item.icon}</div>}
                <div className="font-mono font-bold text-[14px] text-[#111] mt-0.5">
                  {item.score != null ? item.score.toFixed(1) : '—'}
                </div>
                <div className="text-[8.5px] font-bold uppercase tracking-[0.03em] text-[#999] mt-0.5 truncate">
                  {item.name}
                </div>
              </div>
            ))}
          </div>

          {rating.comment && (
            <p className="text-[14px] text-[#555] italic mt-3">&ldquo;{rating.comment}&rdquo;</p>
          )}

          {rating.rated_at && (
            <p className="text-[12px] text-[#bbb] mt-2">
              Evaluado el {format(parseISO(rating.rated_at), 'dd/MM/yyyy')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
