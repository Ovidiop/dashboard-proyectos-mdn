import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isFinancePrivileged, canViewEmployeeFicha } from '../../lib/permissions'
import { calcFinanzas, fmtUSD } from '../../utils/metricsFinance'
import { MONTHS } from '../metricas/constants'
import { loadCompanyEmployees, loadClients, loadYearReports } from '../metricas/metricsApi'
import EmployeeFichaContent from '../metricas/EmployeeFichaContent'
import ClientFichaContent from '../metricas/ClientFichaContent'
import EntityGridList, { ViewToggle } from '../common/EntityGridList'
import { activeEmployees } from '../../lib/employees'

const _now = new Date()
const CURRENT_YEAR = _now.getFullYear()
const CURRENT_MONTH = _now.getMonth() + 1

/**
 * Ficha de una línea operativa (metric_lines), con drill-down en un solo modal:
 * click en un miembro o cliente reemplaza el contenido por su ficha con "← Volver".
 * Escape sube un nivel; en la raíz cierra. El botón X cierra desde cualquier nivel.
 *
 * Cuando se recibe canManage + onAssignMember, la sección Miembros muestra un
 * selector para agregar/mover empleados sin cerrar el modal.
 *
 * Props:
 *   line            — objeto de metric_lines (id, name, color, member_user_ids, lead_user_id)
 *   companyId       — uuid de la empresa
 *   canManage       — si el usuario puede gestionar miembros (default: false)
 *   onAssignMember  — async (userId) → agrega empleado a la línea
 *   onRemoveMember  — async (userId) → quita empleado de la línea (solo cuando canManage)
 *   onSetLeader     — async (userId) → marca a ese miembro como jefa de línea (solo cuando canManage)
 *   onRemoveLeader  — async (userId) → quita el liderazgo de ese miembro (solo cuando canManage)
 *   onClose         — callback para cerrar
 */
export default function LineFichaModal({
  line,
  companyId,
  canManage = false,
  onAssignMember,
  onRemoveMember,
  onSetLeader,
  onRemoveLeader,
  onClose,
}) {
  const navigate = useNavigate()
  const { userProfile, can = () => true } = useAuth()
  const privileged = isFinancePrivileged(userProfile)

  const [allEmployees, setAllEmployees] = useState(null) // null = cargando
  const [clients, setClients] = useState(null) // null = cargando
  const [finReports, setFinReports] = useState(null) // null = cargando, [] = sin datos
  const [drill, setDrill] = useState(null) // null | { type: 'employee'|'client', entity }
  const [memberView, setMemberView] = useState('tarjetas')
  const [clientView, setClientView] = useState('tarjetas')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [togglingLeaderId, setTogglingLeaderId] = useState(null)

  // Derivados por render (sin refetch al cambiar member_user_ids)
  const memberIds = line.member_user_ids ?? []
  const members = allEmployees?.filter((u) => memberIds.includes(u.user_id)) ?? []
  // Un empleado archivado no puede agregarse como nuevo miembro de la línea.
  const available = activeEmployees(allEmployees ?? [])
    .filter((u) => !memberIds.includes(u.user_id))
    .sort((a, b) =>
      `${a.first_name ?? ''} ${a.last_name ?? ''}`.localeCompare(
        `${b.first_name ?? ''} ${b.last_name ?? ''}`,
        'es',
        { sensitivity: 'base' },
      ),
    )

  // Carga on-mount: todos los empleados de la empresa + clientes de la línea.
  // No depende de member_user_ids para no refetchear al asignar.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadCompanyEmployees(companyId),
      loadClients(companyId, line.id),
      privileged ? loadYearReports(companyId, CURRENT_YEAR) : Promise.resolve({ data: [] }),
    ]).then(([empRes, cliRes, repRes]) => {
      if (cancelled) return
      setAllEmployees(empRes.data ?? [])
      setClients(cliRes.data ?? [])
      setFinReports((repRes.data ?? []).filter((r) => r.line_id === line.id))
    })
    return () => {
      cancelled = true
    }
  }, [companyId, line.id, privileged])

  // Escape: en drill-down vuelve a la raíz; en la raíz cierra el modal
  useEffect(() => {
    const fn = (e) => {
      if (e.key !== 'Escape') return
      if (drill) setDrill(null)
      else onClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [drill, onClose])

  const loading = allEmployees === null || clients === null

  // Mes actual fijo: así todas las líneas se comparan en el mismo período.
  const lastReport =
    (finReports ?? []).find(
      (r) => r.month === CURRENT_MONTH && r.year === CURRENT_YEAR && !r.data?.incompleto,
    ) ?? null

  function goFinanzas(section) {
    onClose()
    navigate(`/reportes/linea/${line.id}?tab=finanzas&section=${section}`)
  }

  // Agregar / mover empleado desde la ficha
  async function handleAdd(userId) {
    if (!userId || !onAssignMember) return
    setSaving(true)
    await onAssignMember(userId)
    setSaving(false)
  }

  // Quitar empleado de la línea
  async function handleRemove(userId) {
    if (!onRemoveMember) return
    setRemovingId(userId)
    await onRemoveMember(userId)
    setRemovingId(null)
  }

  // Marcar/quitar jefa de línea — solo puede haber una a la vez
  async function handleToggleLeader(userId) {
    setTogglingLeaderId(userId)
    if (line.lead_user_id === userId) {
      await onRemoveLeader?.(userId)
    } else {
      await onSetLeader?.(userId)
    }
    setTogglingLeaderId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col relative">
        {/* Botón cerrar — cierre total desde cualquier nivel */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          aria-label="Cerrar"
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

        {drill ? (
          <>
            {/* Barra de retorno al nivel raíz */}
            <div className="flex-shrink-0 px-4 pt-4">
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#888] hover:text-[#111] transition-colors"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Volver a {line.name}
              </button>
            </div>

            {drill.type === 'employee' ? (
              <EmployeeFichaContent employee={drill.entity} line={line} onClose={onClose} />
            ) : (
              <ClientFichaContent client={drill.entity} line={line} onClose={onClose} />
            )}
          </>
        ) : (
          <>
            {/* Header — mismo estilo del card de LinesView */}
            <div
              className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[#f0ede3] pr-12"
              style={{ background: line.color + '14' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: line.color }}
                />
                <h2 className="text-[19px] font-bold text-[#111]">{line.name}</h2>
              </div>
              {!loading && (
                <p className="text-[12.5px] font-mono text-[#999] mt-1">
                  {members.length} {members.length !== 1 ? 'miembros' : 'miembro'} ·{' '}
                  {clients.length} {clients.length !== 1 ? 'clientes' : 'cliente'}
                </p>
              )}
            </div>

            {loading ? (
              <div className="flex-1 overflow-y-auto flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Miembros */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
                      Miembros
                    </p>
                    {members.length > 0 && !onRemoveMember && (
                      <ViewToggle view={memberView} onChange={setMemberView} />
                    )}
                  </div>
                  {members.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin miembros asignados.</p>
                  ) : onRemoveMember ? (
                    <div className="flex flex-wrap gap-2">
                      {members.map((u) => {
                        const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
                        const isRemoving = removingId === u.user_id
                        const isLeader = line.lead_user_id === u.user_id
                        const isTogglingLeader = togglingLeaderId === u.user_id
                        const visible = canViewEmployeeFicha(userProfile, u.user_id)
                        const avatar = (
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden"
                            style={{ background: u.avatar_url ? undefined : line.color + '33' }}
                          >
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span style={{ color: line.color }}>
                                {`${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase()}
                              </span>
                            )}
                          </span>
                        )
                        return (
                          <div
                            key={u.user_id}
                            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-[#faf9f5] border border-[#ece9df] hover:border-[#d8d4c6] transition-colors"
                          >
                            {visible ? (
                              <button
                                type="button"
                                onClick={() => setDrill({ type: 'employee', entity: u })}
                                className="flex items-center gap-2 text-left"
                                title={`Ver información de ${name}`}
                              >
                                {avatar}
                                <span className="text-[13px] font-medium text-[#333]">{name}</span>
                              </button>
                            ) : (
                              <span className="flex items-center gap-2" title={name}>
                                {avatar}
                                <span className="text-[13px] font-medium text-[#333]">{name}</span>
                              </span>
                            )}
                            {(onSetLeader || onRemoveLeader) && (
                              <button
                                type="button"
                                disabled={isTogglingLeader || !!togglingLeaderId}
                                onClick={() => handleToggleLeader(u.user_id)}
                                aria-label={
                                  isLeader
                                    ? `Quitar a ${name} como jefa de línea`
                                    : `Marcar a ${name} como jefa de línea`
                                }
                                title={isLeader ? 'Jefa de línea' : 'Marcar como jefa de línea'}
                                className={`w-5 h-5 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                                  isLeader ? 'text-[#FFB800]' : 'text-[#ccc] hover:text-[#FFB800]'
                                }`}
                              >
                                {isTogglingLeader ? (
                                  <div className="w-3 h-3 border border-[#FFB800] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill={isLeader ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  >
                                    <path
                                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isRemoving || !!removingId}
                              onClick={() => handleRemove(u.user_id)}
                              aria-label={`Quitar a ${name} de la línea`}
                              className="w-5 h-5 flex items-center justify-center rounded-lg text-[#bbb] hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                            >
                              {isRemoving ? (
                                <div className="w-3 h-3 border border-[#FFB800] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 10 10"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                >
                                  <path d="M1 1l8 8M9 1L1 9" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EntityGridList
                      items={members.map((u) => {
                        const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
                        const visible = canViewEmployeeFicha(userProfile, u.user_id)
                        return {
                          id: u.user_id,
                          name,
                          secondary: u.position?.position_name,
                          imageUrl: u.avatar_url,
                          fallbackText:
                            `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase(),
                          fallbackBg: line.color,
                          title: visible ? `Ver información de ${name}` : name,
                          disabled: !visible,
                          raw: u,
                        }
                      })}
                      view={memberView}
                      onItemClick={(u) => setDrill({ type: 'employee', entity: u })}
                    />
                  )}

                  {/* Selector para agregar/mover empleado (solo canManage) */}
                  {canManage && available.length > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      <select
                        className="input-base flex-1 text-[13.5px]"
                        defaultValue=""
                        disabled={saving}
                        onChange={(e) => {
                          const uid = e.target.value
                          if (uid) {
                            handleAdd(uid)
                            e.target.value = ''
                          }
                        }}
                        aria-label={`Agregar empleado a ${line.name}`}
                      >
                        <option value="" disabled>
                          Agregar empleado…
                        </option>
                        {available.map((u) => (
                          <option key={u.user_id} value={u.user_id}>
                            {`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()}
                          </option>
                        ))}
                      </select>
                      {saving && (
                        <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      )}
                    </div>
                  )}
                </div>

                {/* Clientes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
                      Clientes
                    </p>
                    {clients.length > 0 && (
                      <ViewToggle view={clientView} onChange={setClientView} />
                    )}
                  </div>
                  {clients.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin clientes en esta línea.</p>
                  ) : (
                    <EntityGridList
                      items={clients.map((c) => ({
                        id: c.id,
                        name: c.name,
                        secondary: null,
                        imageUrl: c.logo_url,
                        fallbackText: c.name?.[0] ?? '?',
                        fallbackBg: null,
                        title: `Ver ficha de ${c.name}`,
                        raw: c,
                      }))}
                      view={clientView}
                      onItemClick={(c) => setDrill({ type: 'client', entity: c })}
                      gridClass="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2"
                    />
                  )}
                </div>

                {/* Finanzas del último período — solo nivel 4 / admin */}
                {privileged && (
                  <div>
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                      Finanzas
                      {lastReport ? ` · ${MONTHS[lastReport.month - 1]} ${CURRENT_YEAR}` : ''}
                    </p>
                    {!lastReport ? (
                      <p className="text-[13.5px] text-[#bbb]">
                        Aún no hay datos financieros para {MONTHS[CURRENT_MONTH - 1]} {CURRENT_YEAR}
                        .
                      </p>
                    ) : (
                      (() => {
                        const f = calcFinanzas(lastReport.data ?? {})
                        const canGo = can('reportes')
                        return (
                          <div className="grid grid-cols-3 gap-2">
                            <FinKpi
                              label="Ingresos brutos"
                              value={fmtUSD(f.totIngresos)}
                              color="text-green-600"
                              onClick={canGo ? () => goFinanzas('ingresos') : undefined}
                              title={canGo ? 'Ir a ingresos' : undefined}
                            />
                            <FinKpi
                              label="Total egresos"
                              value={fmtUSD(f.totEgresos)}
                              color="text-red-500"
                              onClick={canGo ? () => goFinanzas('gastos') : undefined}
                              title={canGo ? 'Ir a gastos' : undefined}
                            />
                            <FinKpi
                              label="Diferencia"
                              value={fmtUSD(f.diferencia)}
                              color={f.diferencia >= 0 ? 'text-green-600' : 'text-red-500'}
                            />
                          </div>
                        )
                      })()
                    )}
                  </div>
                )}

                {/* Acceso directo al reporte — disponible para todos con acceso a reportes */}
                {can('reportes') && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      navigate(`/reportes/linea/${line.id}?tab=hub`)
                    }}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-[#faf9f5] border border-[#ece9df] text-[13.5px] text-[#666] hover:bg-[#f5f3eb] hover:border-[#d8d4c6] hover:text-[#111] transition-colors"
                  >
                    Ver reporte de la línea →
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Mini-KPI financiero: botón navegable si recibe onClick, div estático si no. */
function FinKpi({ label, value, color, onClick, title }) {
  const inner = (
    <>
      <p className="text-[10.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-0.5">
        {label}
      </p>
      <p className={`text-[15px] font-bold ${color}`}>{value}</p>
    </>
  )
  const base = 'p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df] text-left'
  if (!onClick) {
    return <div className={base}>{inner}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${base} hover:bg-[#f5f3eb] hover:border-[#d8d4c6] transition-colors`}
    >
      {inner}
    </button>
  )
}
