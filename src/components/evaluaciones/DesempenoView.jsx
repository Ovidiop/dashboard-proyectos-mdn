import { useState } from 'react'
import Avatar from '../Avatar'
import MonthPeriodPicker, { thisMonthStr, monthStrToDate } from '../common/MonthPeriodPicker'
import EmployeeScoreModal from './EmployeeScoreModal'
import ManagerRatingModal from './ManagerRatingModal'
import { useEmployeeScores } from '../../hooks/useEmployeeScores'
import { useManagerRatings } from '../../hooks/useManagerRatings'
import { useAuth } from '../../context/AuthContext'
import { resolveEmployeeNota, notaColor } from '../../utils/employeeCombinedScore'

const ESTADO_BADGE = {
  ok: { label: 'Al día', cls: 'bg-[#E6F5EF] text-[#0B6B4A] border-[#c7e8db]' },
  parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sin_datos: { label: 'Sin datos', cls: 'bg-[#f0ede3] text-[#888] border-[#e0ddd4]' },
}

const COLUMNS = [
  { key: 'nombre', label: 'Empleado', sortable: true },
  { key: 'cargo', label: 'Cargo', sortable: true },
  { key: 'auto', label: 'Automático', sortable: true },
  { key: 'jefe', label: 'Jefe', sortable: true },
  { key: 'nota', label: 'Nota', sortable: true },
  { key: 'estado', label: 'Estado', sortable: false },
]

function fullName(u) {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—'
}

function DeltaArrow({ delta }) {
  if (delta == null || Math.abs(delta) < 0.05) return null
  const up = delta > 0
  return (
    <span
      className={`text-[10.5px] font-bold font-mono ml-1 ${up ? 'text-[#0E9A69]' : 'text-[#CF3A2E]'}`}
      title={`${up ? 'Subió' : 'Bajó'} ${Math.abs(delta).toFixed(1)} vs. mes anterior`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(delta).toFixed(1)}
    </span>
  )
}

function SortIcon({ col, sortKey, sortAsc }) {
  if (!col.sortable) return null
  const active = sortKey === col.key
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      className={`inline ml-1 flex-shrink-0 ${active ? 'opacity-100' : 'opacity-30'}`}
    >
      {sortAsc && active ? (
        <path d="M4 1L7 6H1L4 1Z" fill="currentColor" />
      ) : (
        <path d="M4 7L1 2H7L4 7Z" fill="currentColor" />
      )}
    </svg>
  )
}

/**
 * "Desempeño": tabla de empleados + ranking del mes (nivel 2+ — la RLS/RPC ya acota
 * a quienes cada nivel puede ver: su línea para nivel 2-3, todos para nivel 4/admin).
 * Reemplaza al tab "Empleados" del flujo manual (ver ARQUITECTURA.md §2.7).
 *
 * Todas las columnas numéricas están sobre 5 — la misma escala que ScoreBreakdownCard
 * (vía resolveEmployeeNota), para que la nota de la tabla nunca contradiga la del
 * modal de detalle. El orden por defecto es por Nota descendente; la evaluación del
 * jefe es informativa pero sí entra en la Nota combinada que se ordena aquí — a
 * diferencia del ranking oficial de la empresa, que solo usa el automático (ver
 * ARQUITECTURA.md §2.7).
 */
export default function DesempenoView() {
  const { userProfile, can = () => true } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const [search, setSearch] = useState('')
  const [soloSinEvaluar, setSoloSinEvaluar] = useState(false)
  const [sortKey, setSortKey] = useState('nota')
  const [sortAsc, setSortAsc] = useState(false)
  const [modalIndex, setModalIndex] = useState(null)
  const [ratingModalUserId, setRatingModalUserId] = useState(null)
  const date = monthStrToDate(selectedMonth)
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const { loading, error, scores, users, isSnapshot, prevScores } = useEmployeeScores({
    year,
    month,
  })
  const {
    criteriaByPosition,
    ratings,
    prevRatings,
    save: saveRating,
  } = useManagerRatings({ year, month, companyId: userProfile?.company_id })

  const canEvaluar = can('evaluaciones.evaluar')

  // A diferencia del ranking automático, un empleado sin score (cargo sin
  // indicadores, ej. Community Manager) igual aparece aquí si el jefe lo evaluó —
  // la evaluación subjetiva es la única fuente posible para esos cargos.
  const allRows = users
    .map((u) => ({ user: u, result: scores.get(u.user_id) }))
    .filter((r) => r.result && (r.result.score != null || ratings.get(r.user.user_id)))
    .map((r) => {
      const criteria = criteriaByPosition.get(r.user.position_id) ?? []
      const managerRating = ratings.get(r.user.user_id)
      const nota = resolveEmployeeNota({ result: r.result, managerRating, criteria })
      const prevNota = resolveEmployeeNota({
        result: prevScores.has(r.user.user_id) ? { score: prevScores.get(r.user.user_id) } : null,
        managerRating: prevRatings.get(r.user.user_id),
        criteria,
      })
      return {
        ...r,
        criteria,
        managerRating,
        nota,
        delta: nota.nota != null && prevNota.nota != null ? nota.nota - prevNota.nota : null,
      }
    })

  const filtered = allRows.filter((r) => {
    if (soloSinEvaluar && (!r.criteria.length || r.managerRating)) return false
    if (search) {
      const q = search.toLowerCase()
      const cargo = r.user.position?.position_name?.toLowerCase() ?? ''
      if (!fullName(r.user).toLowerCase().includes(q) && !cargo.includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    switch (sortKey) {
      case 'cargo':
        va = a.user.position?.position_name ?? ''
        vb = b.user.position?.position_name ?? ''
        break
      case 'auto':
        va = a.nota.autoSobre5 ?? -1
        vb = b.nota.autoSobre5 ?? -1
        break
      case 'jefe':
        va = a.nota.managerAvg ?? -1
        vb = b.nota.managerAvg ?? -1
        break
      case 'nota':
        va = a.nota.nota ?? -1
        vb = b.nota.nota ?? -1
        break
      default:
        va = fullName(a.user)
        vb = fullName(b.user)
    }
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortAsc ? -1 : 1
    if (va > vb) return sortAsc ? 1 : -1
    return 0
  })

  function handleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const modalRow = modalIndex != null ? sorted[modalIndex] : null
  const ratingModalUser = users.find((u) => u.user_id === ratingModalUserId) ?? null
  const ratingModalCriteria = ratingModalUser
    ? (criteriaByPosition.get(ratingModalUser.position_id) ?? [])
    : []

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
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px] sm:min-w-[220px]">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="6.5" cy="6.5" r="5" />
                <path d="M10.5 10.5L14 14" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o cargo…"
                className="input-base text-[14px] py-1.5 pl-8 w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => setSoloSinEvaluar((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
                soloSinEvaluar
                  ? 'bg-[#fff3e0] text-[#e65100] border-[#f5c99a]'
                  : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
              }`}
            >
              {soloSinEvaluar ? 'Mostrando solo sin evaluar' : 'Sin evaluar'}
            </button>
          </div>

          {sorted.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
              <p className="text-[15px] text-[#888]">
                {allRows.length === 0
                  ? 'No hay empleados con datos suficientes en este período.'
                  : 'Sin resultados para esos filtros.'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        className={`px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap ${
                          col.sortable ? 'cursor-pointer select-none hover:text-[#111]' : ''
                        }`}
                      >
                        {col.label}
                        <SortIcon col={col} sortKey={sortKey} sortAsc={sortAsc} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => {
                    const { user, nota, delta, criteria } = row
                    const badge = ESTADO_BADGE[row.result.estado]
                    return (
                      <tr
                        key={user.user_id}
                        onClick={() => setModalIndex(i)}
                        className="border-b border-[#f0ede3] last:border-0 hover:bg-[#fafaf7] transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-[160px]">
                            <Avatar user={user} size={28} />
                            <span className="text-[14px] font-semibold text-[#111] truncate">
                              {fullName(user)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[13.5px] text-[#666] truncate max-w-[160px]">
                          {user.position?.position_name ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[14px] font-mono text-[#555]">
                          {nota.autoSobre5 != null ? nota.autoSobre5.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {nota.managerAvg != null ? (
                            <span className="text-[14px] font-mono text-[#555]">
                              {nota.managerAvg.toFixed(1)}
                            </span>
                          ) : canEvaluar &&
                            criteria.length > 0 &&
                            user.user_id !== userProfile?.user_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setRatingModalUserId(user.user_id)
                              }}
                              className="text-[12.5px] font-semibold px-2 py-0.5 rounded-full bg-[#111] text-white hover:bg-[#222] transition-colors"
                            >
                              Evaluar
                            </button>
                          ) : (
                            <span className="text-[14px] font-mono text-[#bbb]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="text-[16px] font-bold font-mono"
                            style={{ color: notaColor(nota.nota) }}
                          >
                            {nota.nota != null ? nota.nota.toFixed(1) : '—'}
                          </span>
                          <DeltaArrow delta={delta} />
                        </td>
                        <td className="px-3 py-2.5">
                          {badge && (
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalRow && (
        <EmployeeScoreModal
          rows={sorted}
          index={modalIndex}
          onNavigate={setModalIndex}
          onClose={() => setModalIndex(null)}
          managerRating={modalRow.managerRating}
          criteria={modalRow.criteria}
          canEvaluar={canEvaluar && modalRow.user.user_id !== userProfile?.user_id}
          onEvaluar={() => setRatingModalUserId(modalRow.user.user_id)}
        />
      )}

      {ratingModalUser && (
        <ManagerRatingModal
          employee={ratingModalUser}
          criteria={ratingModalCriteria}
          existing={ratings.get(ratingModalUser.user_id)}
          onClose={() => setRatingModalUserId(null)}
          onSave={(payload) =>
            saveRating(ratingModalUser.user_id, { ...payload, ratedBy: userProfile?.user_id })
          }
        />
      )}
    </div>
  )
}
