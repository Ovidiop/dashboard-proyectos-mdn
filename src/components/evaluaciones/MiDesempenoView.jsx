import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import MonthPeriodPicker, { thisMonthStr, monthStrToDate } from '../common/MonthPeriodPicker'
import ScoreBreakdownCard from './ScoreBreakdownCard'
import { useEmployeeScores } from '../../hooks/useEmployeeScores'
import {
  aggregateTaskMetrics,
  aggregateProjectParticipation,
  projectInMonth,
} from '../../utils/aggregateTaskMetrics'
import { aggregateEmployeeFixedTasks, TASK_LABELS } from '../../utils/fixedTasks'
import { COL_META, monthIndex, parseD } from '../tareas/constants'
import { fmtDate } from '../../utils/formatDate'

// ─── Sub-componentes locales (portados de MiPerfilV2View — flujo manual, F6) ──

function SectionLabel({ children }) {
  return (
    <p className="text-[12px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] mb-3">
      {children}
    </p>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, accent = false }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 flex flex-col gap-1 ${
        accent ? 'bg-[#FFB800] border-[#e6a600]' : 'bg-white border-[#e0ddd4]'
      }`}
    >
      <p
        className={`text-[11px] font-mono font-bold tracking-[0.14em] uppercase ${
          accent ? 'text-[#7a5500]' : 'text-[#888]'
        }`}
      >
        {label}
      </p>
      <p className="text-[28px] font-bold leading-none text-[#111]">{value ?? '—'}</p>
      {sub && (
        <p className={`text-[13px] font-medium ${accent ? 'text-[#5a3d00]' : 'text-[#888]'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

function StatusBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-32 flex-shrink-0">
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
        <span className="text-[13px] font-mono text-[#888] truncate">{label}</span>
      </div>
      <div className="flex-1 bg-[#f0ede3] rounded-full h-2 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[13px] font-bold font-mono w-7 text-right text-[#555]">{count}</span>
    </div>
  )
}

function StatChip({ label, value, color = '#888', onClick }) {
  const base =
    'flex flex-col items-center gap-0.5 bg-[#fafaf7] rounded-xl border border-[#e0ddd4] px-4 py-3 min-w-[90px]'
  const clickable = onClick
    ? 'cursor-pointer hover:border-[#bbb] hover:bg-[#f5f3eb] transition-colors'
    : ''
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} ${clickable}`}>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] font-mono text-[#888] uppercase tracking-[0.1em] text-center leading-tight">
        {label}
      </span>
    </button>
  ) : (
    <div className={base}>
      <span className="text-[22px] font-bold leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] font-mono text-[#888] uppercase tracking-[0.1em] text-center leading-tight">
        {label}
      </span>
    </div>
  )
}

const STATUS_ORDER = ['En proceso', 'Por revisar', 'Pendiente', 'Paralizado', 'Terminado']
const PROJECT_STATUS_META = {
  Pendiente: { color: '#F0871F', bg: '#FEF3E2' },
  'En proceso': { color: '#b45309', bg: '#FEF9C3' },
  Completado: { color: '#16A34A', bg: '#DCFCE7' },
}

/**
 * "Mi Desempeño": el score automático del propio empleado, mes a mes (reemplaza a
 * Mi Perfil / Mi Perfil v2 del flujo manual, ver ARQUITECTURA.md §2.7), más el panel
 * operativo (tareas/proyectos/tareas fijas) que antes vivía en Mi Perfil v2 — cada
 * quien ve solo lo suyo aquí; comparar contra el equipo es DesempenoView (nivel 2+).
 */
export default function MiDesempenoView({ userId, companyId }) {
  const navigate = useNavigate()
  const { onViewProject } = useOutletContext() ?? {}
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const date = monthStrToDate(selectedMonth)
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const { loading, error, scores, isSnapshot } = useEmployeeScores({ year, month })
  const result = scores.get(userId)

  // ── Panel operativo (tareas / proyectos / tareas fijas) ─────────────────────
  const [allTasks, setAllTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [fixedClients, setFixedClients] = useState([])
  const [fixedMarks, setFixedMarks] = useState([])
  const [opLoading, setOpLoading] = useState(true)

  const load = useCallback(async () => {
    if (!companyId) return
    setOpLoading(true)
    const [tasksRes, projectsRes, fixedClientsRes, fixedMarksRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('company_id', companyId),
      supabase.from('projects').select('id, name, status, members, created_at'),
      supabase
        .from('metric_clients')
        .select('id, name, social_manager_id, designer_id')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      supabase.from('fixed_task_marks').select('*').eq('company_id', companyId),
    ])
    setAllTasks(tasksRes.data ?? [])
    setProjects(projectsRes.data ?? [])
    setFixedClients(fixedClientsRes.data ?? [])
    setFixedMarks(fixedMarksRes.data ?? [])
    setOpLoading(false)
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const opMonthIdx = monthIndex(parseD(selectedMonth + '-01'))
  const metrics = aggregateTaskMetrics(allTasks, userId, { monthIdx: opMonthIdx, role: 'assignee' })
  const supportMetrics = aggregateTaskMetrics(allTasks, userId, {
    monthIdx: opMonthIdx,
    role: 'support',
  })
  const projectMetrics = aggregateProjectParticipation(projects, userId, { monthIdx: opMonthIdx })

  const targetClientIds = fixedClients
    .filter((c) => c.social_manager_id === userId || c.designer_id === userId)
    .map((c) => c.id)
  const fixedTasksPeriodMarks = fixedMarks.filter(
    (m) => m.period_year === year && m.period_month === month,
  )
  const fixedTasksMetrics = aggregateEmployeeFixedTasks(fixedTasksPeriodMarks, targetClientIds)

  const isOpEmpty =
    metrics.total === 0 &&
    supportMetrics.total === 0 &&
    projectMetrics.total === 0 &&
    fixedTasksMetrics.total === 0

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

      {!loading && !error && <ScoreBreakdownCard result={result} />}

      {/* ── Panel operativo ────────────────────────────────────────────────── */}
      {!opLoading && !isOpEmpty && (
        <>
          {metrics.total > 0 && (
            <div>
              <SectionLabel>Como responsable — {selectedMonth}</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="% Completación"
                  value={`${metrics.completionPct}%`}
                  sub={`${metrics.terminadas} de ${metrics.total} tareas`}
                  accent
                />
                <KpiCard label="Total asignadas" value={metrics.total} />
                <KpiCard label="Terminadas" value={metrics.terminadas} />
                {metrics.onTimePct !== null ? (
                  <KpiCard
                    label="% A tiempo"
                    value={`${metrics.onTimePct}%`}
                    sub={`${metrics.aTiempo} a tiempo · ${metrics.tarde} tarde`}
                  />
                ) : (
                  <KpiCard label="% A tiempo" value="—" sub="Sin fechas de entrega" />
                )}
              </div>
            </div>
          )}

          {metrics.total > 0 && (
            <Card>
              <SectionLabel>Estado operativo actual · click para ver en tareas</SectionLabel>
              <div className="flex flex-wrap gap-3">
                <StatChip
                  label="Retrasadas"
                  value={metrics.retrasadas}
                  color={metrics.retrasadas > 0 ? '#E14848' : '#bbb'}
                  onClick={
                    metrics.retrasadas > 0
                      ? () => navigate(`/tareas?view=base&assignee=${userId}&fAlert=late`)
                      : undefined
                  }
                />
                <StatChip
                  label="Paralizadas"
                  value={metrics.bloqueadas}
                  color={metrics.bloqueadas > 0 ? '#E14848' : '#bbb'}
                  onClick={
                    metrics.bloqueadas > 0
                      ? () => navigate(`/tareas?view=base&assignee=${userId}&status=Paralizado`)
                      : undefined
                  }
                />
                <StatChip
                  label="Atrasadas"
                  value={metrics.arrastradas}
                  color={metrics.arrastradas > 0 ? '#F0871F' : '#bbb'}
                  onClick={
                    metrics.arrastradas > 0
                      ? () => navigate(`/tareas?view=base&assignee=${userId}&fAlert=drag`)
                      : undefined
                  }
                />
                <StatChip
                  label="Pendientes"
                  value={metrics.byStatus['Pendiente'] ?? 0}
                  color={(metrics.byStatus['Pendiente'] ?? 0) > 0 ? '#F0871F' : '#bbb'}
                  onClick={
                    (metrics.byStatus['Pendiente'] ?? 0) > 0
                      ? () => navigate(`/tareas?view=base&assignee=${userId}&status=Pendiente`)
                      : undefined
                  }
                />
              </div>
            </Card>
          )}

          {metrics.total > 0 && Object.keys(metrics.byStatus).length > 0 && (
            <Card>
              <SectionLabel>Distribución por estado</SectionLabel>
              <div className="space-y-2.5">
                {STATUS_ORDER.filter((s) => metrics.byStatus[s] > 0).map((s) => (
                  <StatusBar
                    key={s}
                    label={s}
                    count={metrics.byStatus[s] ?? 0}
                    total={metrics.total}
                    color={COL_META[s]?.color ?? '#888'}
                  />
                ))}
              </div>
            </Card>
          )}

          {supportMetrics.total > 0 && (
            <Card>
              <SectionLabel>Como apoyo de dirección</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Tareas de apoyo" value={supportMetrics.total} />
                <KpiCard label="Terminadas" value={supportMetrics.terminadas} />
                <KpiCard label="% Completación" value={`${supportMetrics.completionPct}%`} />
                {supportMetrics.onTimePct !== null && (
                  <KpiCard label="% A tiempo" value={`${supportMetrics.onTimePct}%`} />
                )}
              </div>
            </Card>
          )}

          {fixedTasksMetrics.total > 0 && (
            <Card>
              <SectionLabel>Tareas fijas — {selectedMonth}</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="% Cumplimiento"
                  value={`${fixedTasksMetrics.cumplimientoPct}%`}
                  sub={`${fixedTasksMetrics.entregadas} de ${fixedTasksMetrics.total} tildadas`}
                  accent
                />
                <KpiCard label="Total tildadas" value={fixedTasksMetrics.total} />
                <KpiCard label="Entregadas" value={fixedTasksMetrics.entregadas} />
              </div>
              <div className="mt-4 space-y-2.5">
                {Object.entries(fixedTasksMetrics.byTaskKey)
                  .filter(([, v]) => v.total > 0)
                  .map(([key, v]) => (
                    <StatusBar
                      key={key}
                      label={TASK_LABELS[key] ?? key}
                      count={v.entregadas}
                      total={v.total}
                      color="#FFB800"
                    />
                  ))}
              </div>
            </Card>
          )}

          {projectMetrics.total > 0 && (
            <Card>
              <SectionLabel>Proyectos</SectionLabel>
              <div className="flex items-center gap-4 mb-4">
                <div>
                  <p className="text-[28px] font-bold text-[#111] leading-none">
                    {projectMetrics.total}
                  </p>
                  <p className="text-[13px] text-[#888] mt-0.5">
                    proyecto{projectMetrics.total !== 1 ? 's' : ''} en los que participa
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[22px] font-bold text-[#16A34A] leading-none">
                    {projectMetrics.completedPct}%
                  </p>
                  <p className="text-[13px] text-[#888] mt-0.5">completados</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {projects
                  .filter(
                    (p) =>
                      Array.isArray(p.members) &&
                      p.members.includes(userId) &&
                      projectInMonth(p, opMonthIdx),
                  )
                  .map((p) => {
                    const meta = PROJECT_STATUS_META[p.status] ?? { color: '#888', bg: '#f0ede3' }
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onViewProject?.(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#fafaf7] transition-colors text-left group"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke={meta.color}
                          strokeWidth="2"
                          className="flex-shrink-0"
                        >
                          <rect x="1" y="1" width="10" height="10" rx="2" />
                        </svg>
                        <span className="flex-1 text-[15px] font-medium text-[#111] truncate group-hover:text-[#111]">
                          {p.name}
                        </span>
                        {p.created_at && (
                          <span className="text-[12px] text-[#aaa] font-mono flex-shrink-0">
                            {fmtDate(p.created_at)}
                          </span>
                        )}
                        <span
                          className="text-[12px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {p.status}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
