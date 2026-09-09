import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { loadCompanyUsers, loadUsageActivity } from './metricsApi'
import { aggregateUsageMonitor, USAGE_MODULES } from '../../utils/aggregateUsageMonitor'
import { buildUsageNarrative } from '../../utils/usageNarrative'
import { MONTHS } from './constants'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i)

const STATUS_META = {
  verde: { dot: 'bg-green-500', label: 'Uso activo' },
  amarillo: { dot: 'bg-amber-400', label: 'Uso parcial / irregular' },
  rojo: { dot: 'bg-red-500', label: 'Uso mínimo / inactividad' },
}

const PUNCTUALITY_META = {
  al_dia: { className: 'text-green-600', label: 'Al día' },
  con_atraso: { className: 'text-amber-600', label: 'Registra con atraso' },
  sin_datos: { className: 'text-[#bbb]', label: 'Sin datos' },
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  fontFamily: 'DM Mono, monospace',
  borderRadius: 8,
  border: '1px solid #e0ddd4',
}

export default function UsoView({ companyId, lines, section = 'dashboard' }) {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [users, setUsers] = useState([])
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedLineId, setExpandedLineId] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    const [usageRes, usersRes] = await Promise.all([
      loadUsageActivity(companyId, { year, month }),
      loadCompanyUsers(companyId),
    ])
    if (usageRes.error) {
      setError(usageRes.error.message ?? 'Error al cargar la actividad.')
      setLoading(false)
      return
    }
    setRaw(usageRes.data)
    setUsers(usersRes.data ?? [])
    setLoading(false)
  }, [companyId, year, month])

  useEffect(() => {
    load()
  }, [load])

  const model = useMemo(() => {
    if (!raw) return null
    return aggregateUsageMonitor({ lines, users, raw, year, month })
  }, [raw, lines, users, year, month])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  const prevMonthNumber = month === 1 ? 12 : month - 1
  const trendData = model
    ? model.months.map(({ year: y, month: m }) => {
        const row = { mes: `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}` }
        model.byLine.forEach((l) => {
          const point = l.trend.find((t) => t.year === y && t.month === m)
          row[l.lineName] = point?.total ?? 0
        })
        return row
      })
    : []
  // Una serie independiente por módulo — cada mini-gráfico tiene su propio dominio Y, para que
  // Reuniones (siempre pocas) no quede aplastada contra el eje por culpa de Tareas (siempre muchas).
  const perModule = USAGE_MODULES.map((mod) => {
    const rows = (model?.byLine ?? []).map((l) => ({
      team: l.lineName,
      color: l.lineColor,
      valor: l.counts[mod.key] ?? 0,
    }))
    return { key: mod.key, label: mod.label, rows }
  })
  // Uso general: el mismo Total que ya muestra la tabla del Dashboard.
  const teamTotals = (model?.byLine ?? []).map((l) => ({
    team: l.lineName,
    color: l.lineColor,
    total: l.total,
  }))
  const hasModuleActivity = teamTotals.some((t) => t.total > 0)

  return (
    <div className="space-y-6">
      {/* Selector de mes/año */}
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-[#888]">
          Conteo de acciones manuales por equipo — comparación relativa, sin mínimos fijos
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            Mes
          </span>
          <select
            className="input-base py-1 text-[15px]"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            Año
          </span>
          <select
            className="input-base py-1 text-[15px]"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla resumen por línea */}
      {section === 'dashboard' && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[#e0ddd4] bg-[#fafaf7]">
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#888]">
                    Línea
                  </th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#888]">
                    Jefa
                  </th>
                  {USAGE_MODULES.map((mod) => (
                    <th
                      key={mod.key}
                      className="text-right px-3 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#888]"
                    >
                      {mod.label}
                    </th>
                  ))}
                  <th className="text-right px-3 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#888]">
                    Total
                  </th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#888]">
                    Puntualidad
                  </th>
                </tr>
              </thead>
              <tbody>
                {(model?.byLine ?? []).map((l) => {
                  const statusMeta = STATUS_META[l.status]
                  const punctMeta = PUNCTUALITY_META[l.punctuality]
                  const isExpanded = expandedLineId === l.lineId
                  return (
                    <Fragment key={l.lineId}>
                      <tr
                        onClick={() => setExpandedLineId(isExpanded ? null : l.lineId)}
                        className="border-b border-[#f0ede3] last:border-0 hover:bg-[#fafaf7] cursor-pointer transition-colors"
                        title={l.reasons.join(' · ') || 'Sin señales fuera de rango'}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusMeta.dot}`}
                              title={statusMeta.label}
                            />
                            <span className="font-semibold text-[#111]">{l.lineName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#555]">{l.lead?.name ?? '—'}</td>
                        {USAGE_MODULES.map((mod) => {
                          const value = l.counts[mod.key]
                          return (
                            <td
                              key={mod.key}
                              className={`text-right px-3 py-3 tabular-nums ${
                                value === 0 ? 'text-red-600 font-bold' : 'text-[#333]'
                              }`}
                            >
                              {value}
                            </td>
                          )
                        })}
                        <td className="text-right px-3 py-3 font-bold text-[#111] tabular-nums">
                          {l.total}
                        </td>
                        <td className={`px-3 py-3 font-medium ${punctMeta.className}`}>
                          {punctMeta.label}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={USAGE_MODULES.length + 4} className="px-4 py-4 bg-[#fafaf7]">
                            <UsoLineDetail line={l} prevMonthNumber={prevMonthNumber} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {(model?.byLine ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={USAGE_MODULES.length + 4}
                      className="px-4 py-10 text-center text-[#aaa]"
                    >
                      Sin líneas operativas configuradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Uso general, tendencia y detalle por módulo */}
      {section === 'graficas' && (
        <>
          <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
              Uso general por team · {MONTHS[month - 1]} {year}
            </p>
            {!hasModuleActivity ? (
              <p className="text-[15px] text-[#aaa] text-center py-8">
                Sin datos para esta ventana
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={teamTotals} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
                  <XAxis
                    dataKey="team"
                    tick={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                  />
                  <Tooltip
                    cursor={{ fill: '#fafaf7' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [v, 'Acciones']}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {teamTotals.map((t) => (
                      <Cell key={t.team} fill={t.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-1">
              Acciones por módulo · {MONTHS[month - 1]} {year}
            </p>
            <p className="text-[12px] text-[#bbb] mb-4">
              Cada módulo usa su propia escala — las alturas se comparan entre teams del mismo
              módulo, no entre módulos distintos.
            </p>
            {!hasModuleActivity ? (
              <p className="text-[15px] text-[#aaa] text-center py-8">
                Sin datos para esta ventana
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {perModule.map((m) => (
                  <div key={m.key} className="border border-[#f0ede3] rounded-xl px-3 py-3">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mb-2">
                      {m.label}
                    </p>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={m.rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f5f2e9" />
                        <XAxis
                          dataKey="team"
                          tick={{ fontSize: 9, fontFamily: 'DM Mono, monospace', fill: '#aaa' }}
                        />
                        <YAxis
                          allowDecimals={false}
                          width={28}
                          tick={{ fontSize: 9, fontFamily: 'DM Mono, monospace', fill: '#aaa' }}
                        />
                        <Tooltip
                          cursor={{ fill: '#fafaf7' }}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v) => [v, m.label]}
                        />
                        <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                          {m.rows.map((r) => (
                            <Cell key={r.team} fill={r.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
              Tendencia · total de acciones del equipo por mes
            </p>
            {trendData.length === 0 ? (
              <p className="text-[15px] text-[#aaa] text-center py-8">
                Sin datos para esta ventana
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fill: '#888' }}
                  />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }} />
                  {(model?.byLine ?? []).map((l) => (
                    <Line
                      key={l.lineId}
                      type="monotone"
                      dataKey={l.lineName}
                      stroke={l.lineColor}
                      strokeWidth={2}
                      dot={{ r: 3, fill: l.lineColor }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <p className="text-[12px] text-[#bbb] leading-relaxed">
            &ldquo;Reuniones marcadas como realizadas&rdquo; se atribuye a quien creó la reunión —
            la base de datos no registra quién la marcó como realizada. Los conteos reflejan el
            estado actual de cada tabla: una fila borrada reduce el conteo del mes en que se creó.
            La Puntualidad no mide volumen: solo evalúa si Tareas, Tareas Fijas y Reuniones se
            registraron a tiempo (CNP y Pautas AV no tienen fecha de referencia) — con pocas
            acciones evaluables, &ldquo;Al día&rdquo; pesa menos que con muchas.
          </p>
        </>
      )}
    </div>
  )
}

const PUNCTUALITY_MODULE_LABELS = {
  reuniones: 'reuniones',
  tareas: 'tareas',
  tareasFijas: 'marcas de Tareas Fijas',
}

function UsoLineDetail({ line, prevMonthNumber }) {
  const narrative = useMemo(
    () => buildUsageNarrative(line, prevMonthNumber),
    [line, prevMonthNumber],
  )
  const allMembers = line.lead
    ? [
        {
          userId: line.lead.userId,
          name: line.lead.name,
          isLead: true,
          counts: line.lead.counts,
          total: line.lead.total,
        },
        ...line.members,
      ]
    : line.members

  // Resumen agregado, no un listado de cada registro: "de 13 tareas, 5 fueron tardías".
  const punctualitySummary = Object.entries(line.punctualityBreakdown ?? {})
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => {
      const label = PUNCTUALITY_MODULE_LABELS[key] ?? key
      const verb = v.late === 1 ? 'fue tardía' : 'fueron tardías'
      return `De ${v.total} ${label}, ${v.late} ${verb}`
    })

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-[#444] leading-relaxed">{narrative}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
          <thead>
            <tr className="border-b border-[#e0ddd4]">
              <th className="text-left px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#888]">
                Miembro
              </th>
              {USAGE_MODULES.map((mod) => (
                <th
                  key={mod.key}
                  className="text-right px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#888]"
                >
                  {mod.label}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#888]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {allMembers.map((m) => (
              <tr key={m.userId} className="border-b border-[#f0ede3] last:border-0">
                <td className="px-3 py-2 text-[#333]">
                  {m.name}
                  {m.isLead && (
                    <span className="ml-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-[#FFB800]">
                      Jefa
                    </span>
                  )}
                </td>
                {USAGE_MODULES.map((mod) => (
                  <td
                    key={mod.key}
                    className={`text-right px-3 py-2 tabular-nums ${
                      m.counts[mod.key] === 0 ? 'text-red-600 font-bold' : 'text-[#555]'
                    }`}
                  >
                    {m.counts[mod.key]}
                  </td>
                ))}
                <td className="text-right px-3 py-2 font-bold text-[#111] tabular-nums">
                  {m.total}
                </td>
              </tr>
            ))}
            {line.external.map((e) => (
              <tr key={e.userId} className="border-b border-[#f0ede3] last:border-0 bg-[#fffaf0]">
                <td className="px-3 py-2 text-[#333]">
                  {e.name}
                  <span className="ml-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-[#b8860b]">
                    Apoyo externo
                  </span>
                </td>
                {USAGE_MODULES.map((mod) => (
                  <td
                    key={mod.key}
                    className={`text-right px-3 py-2 tabular-nums ${
                      e.counts[mod.key] === 0 ? 'text-red-600 font-bold' : 'text-[#555]'
                    }`}
                  >
                    {e.counts[mod.key]}
                  </td>
                ))}
                <td className="text-right px-3 py-2 font-bold text-[#111] tabular-nums">
                  {e.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {punctualitySummary.length > 0 && (
        <div className="text-[13px] text-[#888]">
          <span className="font-semibold text-[#555]">Detalle de puntualidad del equipo: </span>
          {punctualitySummary.join(' · ')}
        </div>
      )}
    </div>
  )
}
