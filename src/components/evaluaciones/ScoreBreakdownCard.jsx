import Avatar from '../Avatar'
import ManagerRatingCard from './ManagerRatingCard'
import { resolveEmployeeNota } from '../../utils/employeeCombinedScore'

// Mismos 3 estados y colores que la ficha técnica de referencia (Mappi): verde =
// medible y al día, ámbar = medición parcial, rojo = no medible / sin datos.
const ESTADO_META = {
  ok: { label: 'Se puede medir', color: '#0E9A69', bg: '#E6F5EF', dark: '#0B6B4A' },
  parcial: { label: 'Medición parcial', color: '#C0820B', bg: '#FDF3DC', dark: '#6E4B03' },
  sin_datos: { label: 'No medible aún', color: '#CF3A2E', bg: '#FBEAE8', dark: '#8A2A21' },
}

// Un ícono fijo por indicador automático — igual criterio que la ficha de referencia
// (un emoji por fila), aplicado a los 9 indicadores de src/utils/employeeScore.js.
const INDICATOR_ICON = {
  entregas: '📋',
  puntualidad: '⏱️',
  arrastre: '🚧',
  tareas_fijas: '📌',
  piezas_av: '🎬',
  reuniones: '👥',
  campanas: '📢',
  chequeo: '🔍',
  tickets: '🎫',
}

function pctColor(pct) {
  if (pct == null) return '#9B958A'
  if (pct >= 0.85) return '#0E9A69'
  if (pct >= 0.6) return '#C0820B'
  return '#CF3A2E'
}

function AutoIndicatorRow({ icon, label, detalle, pct, pesoEfectivo }) {
  return (
    <div className="flex items-center gap-2.5 bg-[#fafaf7] rounded-lg px-2.5 py-2">
      <div className="w-7 h-7 rounded-md bg-[#eeebe3] flex items-center justify-center text-[13px] flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#111] truncate">{label}</div>
        {detalle && <div className="text-[11px] text-[#999] truncate">{detalle}</div>}
      </div>
      <div className="text-right flex-shrink-0">
        {pct == null ? (
          <span className="text-[11px] font-mono text-[#999]">sin dato</span>
        ) : (
          <span className="text-[14px] font-mono font-bold" style={{ color: pctColor(pct) }}>
            {Math.round(pct * 100)}%
          </span>
        )}
        {pesoEfectivo > 0 && (
          <div className="text-[8.5px] font-bold text-[#999] mt-0.5">
            {Math.round(pesoEfectivo)}% del total
          </div>
        )}
        {pct != null && (
          <div className="w-11 h-1 bg-[#eeebe3] rounded-full mt-1 overflow-hidden ml-auto">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, pct * 100)}%`, background: pctColor(pct) }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Ficha de desempeño de un empleado en un mes, con el mismo lenguaje visual que la
 * ficha técnica de referencia (Mappi): avatar con anillo de color según estado,
 * nota /5 en grande, badge de estado, bloque "🤖 Lo mide Mappi solo" (indicadores
 * automáticos que aplican al cargo) y bloque "🗓️ Lo evalúa el jefe" (criterios
 * subjetivos, ver ARQUITECTURA.md §2.7), cerrando con una nota de color según estado.
 *
 * @param {object} result          salida de computeEmployeeScore / fila de employee_score_snapshots
 * @param {object} [employee]      {first_name, last_name, avatar_url, user_id} para el avatar
 * @param {string} [cargoLabel]    nombre del cargo, mostrado bajo el nombre
 * @param {object} [managerRating] fila de manager_ratings del mes, si existe
 * @param {Array} [criteria]       criterios activos del cargo del empleado
 * @param {boolean} [canEvaluar]   true si el usuario actual puede evaluar a este empleado
 * @param {Function} [onEvaluar]   callback para abrir el modal de evaluación
 */
export default function ScoreBreakdownCard({
  result,
  employeeName,
  employee,
  cargoLabel,
  managerRating,
  criteria,
  canEvaluar,
  onEvaluar,
}) {
  if (!result) return null

  const { estado, breakdown, narrativa } = result
  const meta = ESTADO_META[estado] ?? ESTADO_META.sin_datos
  const { nota, hasCriteria } = resolveEmployeeNota({ result, managerRating, criteria })

  // Solo los indicadores que aplican al cargo (peso > 0 en el perfil resuelto) —
  // los que no aplican (ej. Tickets IT para un cargo de back-office) no se listan.
  const applicableBreakdown = (breakdown ?? []).filter((b) => Number(b.pesoBase) > 0)

  const name =
    employeeName ??
    (employee ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() : null)

  const noteText =
    estado === 'ok'
      ? (narrativa ?? 'Al día con los indicadores que le aplican este mes.')
      : estado === 'parcial'
        ? (narrativa ?? 'Puntaje provisional — no compite en el ranking este mes.')
        : (narrativa ??
          (hasCriteria
            ? 'Sin indicadores automáticos suficientes este mes. Se evalúa con el jefe.'
            : 'Sin datos automáticos suficientes este mes.'))

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden">
      <div className="h-[5px]" style={{ background: meta.color }} />

      <div className="p-5 sm:p-6">
        {/* Cabecera: avatar + nombre/cargo + nota */}
        <div className="flex items-center gap-3.5">
          <div
            className="rounded-full flex-shrink-0"
            style={{ boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${meta.color}` }}
          >
            {employee ? (
              <Avatar user={employee} size={52} />
            ) : (
              <div
                className="rounded-full flex items-center justify-center font-bold text-white"
                style={{ width: 52, height: 52, background: meta.color, fontSize: 19 }}
              >
                {name?.[0]?.toUpperCase() ?? '—'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {name && <p className="text-[15.5px] font-bold text-[#111] truncate">{name}</p>}
            {cargoLabel && <p className="text-[13px] text-[#888] mt-0.5 truncate">{cargoLabel}</p>}
          </div>
          <div className="text-center flex-shrink-0">
            <div
              className="font-bold leading-none font-mono"
              style={{ fontSize: 26, color: nota == null ? '#bbb' : meta.color }}
            >
              {nota == null ? '—' : nota.toFixed(1)}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#bbb] mt-1">
              {nota == null ? 'sin datos' : 'sobre 5'}
            </div>
          </div>
        </div>

        {/* Badge de estado */}
        <div className="flex items-center gap-1.5 mt-3.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: meta.color }}
          />
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>

        {/* 🤖 Lo mide Mappi solo */}
        {applicableBreakdown.length > 0 && (
          <div className="mt-4">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#999] mb-2">
              🤖 Lo mide Mappi solo
            </p>
            <div className="space-y-1.5">
              {applicableBreakdown.map((b) => (
                <AutoIndicatorRow
                  key={b.key}
                  icon={INDICATOR_ICON[b.key] ?? '•'}
                  label={b.label}
                  detalle={b.aplica ? null : 'Sin datos suficientes este mes'}
                  pct={b.aplica ? b.pct : null}
                  pesoEfectivo={b.pesoEfectivo}
                />
              ))}
            </div>
          </div>
        )}

        {/* 🗓️ Lo evalúa el jefe */}
        <ManagerRatingCard
          rating={managerRating}
          criteria={criteria}
          canEvaluar={canEvaluar}
          onEvaluar={onEvaluar}
          caption={
            applicableBreakdown.length > 0
              ? '🗓️ Lo evalúa el jefe, una vez al mes'
              : '🗓️ Lo evalúa el jefe — único criterio hoy'
          }
        />

        {/* Nota de estado */}
        <div
          className="rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed mt-4"
          style={{ background: meta.bg, color: meta.dark }}
        >
          <b>
            {estado === 'ok'
              ? 'Al día.'
              : estado === 'parcial'
                ? 'Nota provisional.'
                : 'Sin datos automáticos.'}
          </b>{' '}
          {noteText}
        </div>
      </div>
    </div>
  )
}
