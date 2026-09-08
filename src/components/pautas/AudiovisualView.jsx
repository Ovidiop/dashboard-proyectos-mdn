import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import { loadCompanyEmployees } from '../metricas/metricsApi'
import { loadPautas, loadPiezas, updatePauta } from './avPautasApi'
import { loadExternalResources } from './externalResourcesApi'
import {
  avEditMode,
  nextAgendaDeadline,
  pautasInScope,
  pautasInMonth,
  isOutOfMonth,
  externalAsUser,
  externalUsersForRole,
} from '../../utils/audiovisual'
import AvCalendar from './AvCalendar'
import AvPhaseTable from './AvPhaseTable'
import AvAnalytics from './AvAnalytics'
import PautaDetailModal from './PautaDetailModal'
import DayPautasModal from './DayPautasModal'
import WhatsAppAgendaModal from './WhatsAppAgendaModal'

const ALL_LINES = '__all__'

function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Sub-sección Audiovisual de Tareas Fijas: calendario de pautas + flujo de aprobación
 * (solicitada → programada → realizada/declinada) + analítica de piezas. Se monta desde
 * TareasFijasPage con `lines`/`clients` ya cargadas por la página (mismo roster que la
 * sub-sección Redes-Diseño); gestiona su propio estado de pautas + empleados + realtime,
 * igual que ReunionesPage.
 */
export default function AudiovisualView({ companyId, userProfile, can, lines, clients }) {
  const canManage = can('audiovisual.manage')
  const canCoordinate = can('audiovisual.coordina')
  const editMode = avEditMode({ canCoordinate, canManage })
  // Edición de piezas y asignación de editores en pautas 'realizada': el depto
  // Audiovisual completo, no solo la coordinadora. `canCoordinate` la incluye por
  // composición (no se duplica la regla de Lizdania en la fila de audiovisual.piezas).
  // No afecta a `editMode`: agendar/declinar/editar fecha-recurso siguen exclusivos
  // de audiovisual.coordina.
  const canEditPiezas = canCoordinate || can('audiovisual.piezas')
  // "Ver todo" (todas las líneas) es una capability aparte de "coordina" (agendar/
  // declinar/marcar realizada): antes cualquier coordinador del depto Audiovisual veía
  // todas las líneas; ahora eso queda acotado a dirección (nivel≥4), admin, o quien
  // tenga explícitamente audiovisual.ver_todo o audiovisual.piezas (configurable en
  // Empresa → Permisos — sembradas por defecto para Lizdania y el depto Audiovisual
  // respectivamente). Sin línea propia, `pautasInScope`/`scopedClients` igual muestran
  // todo (comportamiento existente, sin cambios).
  const canViewAll =
    userProfile?.access_level >= 4 ||
    userProfile?.admin === true ||
    can('audiovisual.ver_todo') ||
    can('audiovisual.piezas')

  const [{ year, month }, setPeriod] = useState(currentYearMonth)
  const [pautas, setPautas] = useState([])
  const [piezas, setPiezas] = useState([])
  const [employees, setEmployees] = useState([])
  const [externalResources, setExternalResources] = useState([])
  const [loading, setLoading] = useState(true)
  // Solo relevante cuando canViewAll (badges "Todos"/línea): sin ese permiso, el alcance queda
  // SIEMPRE derivado de `lines` (la única línea visible de la jefa) — nunca en estado, para
  // que no pueda quedar "atascado" en ALL_LINES si `lines` llega vacío en el primer render
  // (p. ej. mientras la página aún está cargando) y termine mostrando pautas de otras líneas.
  const [scopeLineId, setScopeLineId] = useState(ALL_LINES)
  const [detailPauta, setDetailPauta] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [waOpen, setWaOpen] = useState(false)
  // Pestaña activa de AvPhaseTable, levantada aquí (en vez de vivir dentro de
  // AvPhaseTable) porque `onPhaseChange` la necesita tras crear/guardar una solicitud
  // (salta a la pestaña Solicitudes). Independiente del filtro del calendario: cambiar de
  // pestaña en la tabla ya NO afecta lo que se ve en el calendario — ver `calendarFilter`.
  const [phase, setPhase] = useState('solicitudes')
  // Filtro del calendario, controlado únicamente por los SummaryCard de arriba
  // (Todas/Agendadas/Realizadas) — deliberadamente independiente de `phase`.
  const [calendarFilter, setCalendarFilter] = useState('todas')
  // Ids de pautas "ancladas": se editó su fecha a un mes distinto del que se está viendo
  // y se mantienen visibles en AvPhaseTable (con aviso) en vez de desaparecer de golpe.
  // Es estado transitorio — se limpia al cambiar de mes/pestaña o recargar, nunca persiste.
  const [pinnedIds, setPinnedIds] = useState(() => new Set())
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultLineId = !canViewAll ? (lines[0]?.id ?? null) : null
  const scopeLine = canViewAll ? (scopeLineId === ALL_LINES ? null : scopeLineId) : defaultLineId

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [pautasRes, employeesRes, piezasRes, externalRes] = await Promise.all([
      loadPautas(companyId),
      loadCompanyEmployees(companyId),
      loadPiezas(companyId),
      loadExternalResources(companyId),
    ])
    setPautas(pautasRes.data ?? [])
    setEmployees(employeesRes.data ?? [])
    setPiezas(piezasRes.data ?? [])
    setExternalResources(externalRes.data ?? [])
    setPinnedIds(new Set())
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Abrir el detalle de una pauta específica desde ?pautaId=uuid (deeplink desde la
  // campanita de notificaciones — mismo patrón que ?meetingId= en ReunionesPage y
  // ?taskId= en TareasPage). Además de abrir el modal, mueve el calendario/tabla al
  // mes y pestaña de la pauta para que no quede oculta tras los filtros vigentes.
  useEffect(() => {
    const pautaId = searchParams.get('pautaId')
    if (!pautaId || pautas.length === 0) return
    const pauta = pautas.find((p) => p.id === pautaId)
    if (pauta) {
      setDetailPauta(pauta)
      if (pauta.pauta_date) {
        const d = new Date(pauta.pauta_date)
        setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
      }
      setPhase(
        pauta.status === 'programada'
          ? 'agenda'
          : pauta.status === 'realizada'
            ? 'realizadas'
            : 'solicitudes',
      )
      if (canViewAll && pauta.line_id) setScopeLineId(pauta.line_id)
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('pautaId')
        return next
      },
      { replace: true },
    )
  }, [searchParams, pautas, canViewAll, setSearchParams])

  // Realtime: canal creado sincrónicamente (evita el race de StrictMode), patrón
  // AppLayout/ReunionesPage/TareasFijasPage.
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('av-pautas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'av_pautas' }, (payload) => {
        setPautas((prev) => {
          if (payload.eventType === 'INSERT') {
            if (payload.new.company_id !== companyId) return prev
            return prev.some((p) => p.id === payload.new.id) ? prev : [...prev, payload.new]
          }
          if (payload.eventType === 'UPDATE')
            return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
          if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== payload.old.id)
          return prev
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId])

  // Realtime del checklist de piezas — mismo patrón que el canal de arriba. El trigger de
  // BD que deriva av_pautas.piezas_editadas dispara además un UPDATE de av_pautas, que ya
  // llega por el canal anterior.
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('av-pauta-piezas-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'av_pauta_piezas' },
        (payload) => {
          setPiezas((prev) => {
            if (payload.eventType === 'INSERT') {
              if (payload.new.company_id !== companyId) return prev
              return prev.some((p) => p.id === payload.new.id) ? prev : [...prev, payload.new]
            }
            if (payload.eventType === 'UPDATE')
              return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== payload.old.id)
            return prev
          })
        },
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId])

  function handleChanged(pauta) {
    setPautas((prev) => {
      const exists = prev.some((p) => p.id === pauta.id)
      return exists ? prev.map((p) => (p.id === pauta.id ? pauta : p)) : [...prev, pauta]
    })
    setDetailPauta((prev) => (prev && prev.id === pauta.id ? pauta : prev))
    // Si la edición le puso una fecha de otro mes, se ancla para que no desaparezca de
    // AvPhaseTable de golpe — ver `monthPautas` más abajo y el aviso "↗ mes" en las filas.
    if (isOutOfMonth(pauta, year, month)) {
      setPinnedIds((prev) => (prev.has(pauta.id) ? prev : new Set(prev).add(pauta.id)))
    }
  }

  // Solo para el borrado DEFINITIVO desde la Papelera (AvPhaseTable → ConfirmDeleteDialog) —
  // el soft delete normal ("Borrar" en cualquier fase) es un UPDATE y pasa por handleChanged.
  function handleDeleted(id) {
    setPautas((prev) => prev.filter((p) => p.id !== id))
  }

  function handlePiezaChanged(pieza) {
    setPiezas((prev) => {
      const exists = prev.some((p) => p.id === pieza.id)
      return exists ? prev.map((p) => (p.id === pieza.id ? pieza : p)) : [...prev, pieza]
    })
  }

  function handlePiezaDeleted(id) {
    setPiezas((prev) => prev.filter((p) => p.id !== id))
  }

  // Handler compartido con AvPhaseTable.handleFields (mismo patrón), pero vive acá porque
  // el modal de detalle es hermano de la tabla, no hijo — ambos actualizan la misma pauta
  // vía updatePauta y reconcilian con handleChanged. Devuelve `{ error }` (antes lo tragaba
  // en silencio) para que PautaDetailModal pueda mostrarlo en su propio banner.
  async function handlePautaFields(pauta, fields) {
    const { data, error: err } = await updatePauta(pauta.id, fields)
    if (err) return { error: err }
    handleChanged(data)
    return { error: null }
  }

  const scopedPautas = pautasInScope(pautas, scopeLine)
  // Sin las borradas: el calendario y el generador de agenda de WhatsApp no deben pintar ni
  // listar una pauta que está en la papelera.
  const visibleScopedPautas = scopedPautas.filter((p) => !p.deleted_at)
  const scopedClients = clients.filter((c) => !scopeLine || c.line_id === scopeLine)
  const audiovisualUsers = employees.filter((u) => u.department_id === 2 && !u.deleted_at)
  // Recursos externos (no son empleados, ver ARQUITECTURA.md): se modelan como
  // pseudo-usuarios (`ext:<uuid>`) e inyectan en los mismos pickers/usersById que los
  // empleados de Audiovisual, filtrados por el rol correspondiente. Nunca entran como
  // asistentes (allEmployees más abajo usa solo `employees`).
  const recursoOptions = [
    ...audiovisualUsers,
    ...externalUsersForRole(externalResources, 'grabacion'),
  ]
  const editorOptions = [...audiovisualUsers, ...externalUsersForRole(externalResources, 'edicion')]
  const usersById = new Map([
    ...employees.map((u) => [u.user_id, u]),
    ...externalResources.map((r) => {
      const u = externalAsUser(r)
      return [u.user_id, u]
    }),
  ])
  const piezasByPautaMap = new Map()
  piezas.forEach((pz) => {
    if (!piezasByPautaMap.has(pz.pauta_id)) piezasByPautaMap.set(pz.pauta_id, [])
    piezasByPautaMap.get(pz.pauta_id).push(pz)
  })
  // Tabla de seguimiento + recuadros de resumen + analítica siguen al mes que se está
  // viendo en el calendario (pautas sin fecha se mantienen visibles siempre, ver
  // pautasInMonth). El calendario mismo (AvCalendar) recibe `scopedPautas` sin este
  // filtro: ya arma su propia grilla acotada al mes/año, incluyendo los días de relleno
  // de semanas adyacentes.
  //
  // `monthPautas` SÍ conserva las borradas (deleted_at seteado): es lo que le llega a
  // AvPhaseTable, que necesita verlas para poder listarlas en la pestaña Papelera. Todo lo
  // demás (calendario, recuadros de resumen, analítica) debe excluirlas explícitamente —
  // una pauta en la papelera no es "programada"/"realizada" a efectos de esas vistas.
  //
  // `monthPautas` incluye además las pautas "ancladas" (`pinnedIds`): se les cambió la fecha
  // a otro mes y se mantienen visibles en AvPhaseTable con un aviso, en vez de desaparecer.
  // Los recuadros de resumen y AvAnalytics usan `visiblePautas`, que NO ancla nada — una
  // pauta anclada de otro mes no debe seguir contando como "Agendada"/"Realizada" de este mes.
  const monthPautas = pautasInMonth(scopedPautas, year, month, pinnedIds)
  const visiblePautas = pautasInMonth(scopedPautas, year, month).filter((p) => !p.deleted_at)

  const { deadline } = nextAgendaDeadline()
  // "Agendadas" = pautas con status 'programada' (con o sin fecha) — mismo número que la
  // pestaña "Agenda" de AvPhaseTable.
  const agendadasCount = visiblePautas.filter((p) => p.status === 'programada').length
  const realizadasCount = visiblePautas.filter((p) => p.status === 'realizada').length
  const calendarStatusFilter =
    calendarFilter === 'agendadas'
      ? 'programada'
      : calendarFilter === 'realizadas'
        ? 'realizada'
        : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white border border-[#e8e4d8] rounded-xl px-4 py-3 mb-4 text-[13.5px] text-[#555] leading-relaxed">
        Calendario de <strong>pautas audiovisuales</strong> (grabaciones/sesiones) por cliente. La
        agenda de la semana siguiente se arma el jueves, máximo el viernes 05:00pm.
        <span className="block mt-1 text-[12.5px] font-mono text-[#b98900]">
          Próximo cierre de agenda:{' '}
          {deadline.toLocaleDateString('es-VE', {
            weekday: 'long',
            day: '2-digit',
            month: 'short',
          })}{' '}
          · 05:00pm
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {!canViewAll ? (
          <span className="px-3 py-1 rounded-full text-[14.5px] font-semibold bg-[#FFB800] text-[#111]">
            {lines[0]?.name ?? 'Sin línea'}
          </span>
        ) : (
          <>
            <button
              onClick={() => setScopeLineId(ALL_LINES)}
              className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                scopeLineId === ALL_LINES
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
              }`}
            >
              Todos
            </button>
            {lines.map((l) => (
              <button
                key={l.id}
                onClick={() => setScopeLineId(l.id)}
                className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                  scopeLineId === l.id
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                }`}
              >
                {l.name}
              </button>
            ))}
          </>
        )}
        <button
          onClick={() => setWaOpen(true)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111] bg-[#25D366]/15 border border-[#25D366]/40 px-3 py-1.5 rounded-lg hover:bg-[#25D366]/25 transition-colors ml-auto"
        >
          Generar agenda WhatsApp
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SummaryCard
          label="Todas"
          value={agendadasCount + realizadasCount}
          color="text-[#9a7400]"
          active={calendarFilter === 'todas'}
          onClick={() => setCalendarFilter('todas')}
        />
        <SummaryCard
          label="Agendadas"
          value={agendadasCount}
          color="text-[#3b6fd4]"
          active={calendarFilter === 'agendadas'}
          onClick={() => setCalendarFilter('agendadas')}
        />
        <SummaryCard
          label="Realizadas"
          value={realizadasCount}
          color="text-[#1f8a43]"
          active={calendarFilter === 'realizadas'}
          onClick={() => setCalendarFilter('realizadas')}
        />
      </div>

      <AvCalendar
        year={year}
        month={month}
        pautas={visibleScopedPautas}
        statusFilter={calendarStatusFilter}
        onMonthChange={(y, m) => {
          setPeriod({ year: y, month: m })
          setPinnedIds(new Set())
        }}
        onDayClick={setDayDetail}
        onPautaClick={setDetailPauta}
      />

      <div className="mt-4">
        <AvPhaseTable
          pautas={monthPautas}
          piezas={piezas}
          clients={scopedClients}
          audiovisualUsers={recursoOptions}
          editorUsers={editorOptions}
          allEmployees={employees.filter((u) => !u.deleted_at)}
          resourceUsersById={usersById}
          companyId={companyId}
          userId={userProfile?.user_id}
          defaultLineId={defaultLineId}
          editMode={editMode}
          phase={phase}
          onPhaseChange={(p) => {
            setPhase(p)
            setPinnedIds(new Set())
          }}
          viewYear={year}
          viewMonth={month}
          onGoToMonth={(y, m) => {
            setPeriod({ year: y, month: m })
            setPinnedIds(new Set())
          }}
          onChanged={handleChanged}
          onDeleted={handleDeleted}
          onPautaClick={setDetailPauta}
        />
      </div>

      <AvAnalytics
        pautas={visiblePautas}
        lines={lines}
        usersById={usersById}
        piezasByPauta={piezasByPautaMap}
      />

      {detailPauta && (
        <PautaDetailModal
          pauta={detailPauta}
          usersById={usersById}
          audiovisualUsers={editorOptions}
          piezas={piezas.filter((pz) => pz.pauta_id === detailPauta.id)}
          canEditPiezas={canEditPiezas}
          companyId={companyId}
          onFields={handlePautaFields}
          onPiezaChanged={handlePiezaChanged}
          onPiezaDeleted={handlePiezaDeleted}
          onClose={() => setDetailPauta(null)}
        />
      )}

      {dayDetail && (
        <DayPautasModal
          date={dayDetail}
          pautas={visibleScopedPautas}
          usersById={usersById}
          onClose={() => setDayDetail(null)}
          onPautaClick={(p) => {
            setDayDetail(null)
            setDetailPauta(p)
          }}
        />
      )}

      {waOpen && (
        <WhatsAppAgendaModal
          pautas={visibleScopedPautas}
          lines={lines}
          usersById={usersById}
          onClose={() => setWaOpen(false)}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filtrar por ${label}`}
      className={`text-left bg-white border rounded-xl px-4 py-3 min-w-[130px] transition-colors ${
        active
          ? 'border-[#FFB800] ring-1 ring-[#FFB800]/40'
          : 'border-[#e0ddd4] hover:border-[#d8d4c6]'
      }`}
    >
      <div className={`text-[22px] font-semibold ${color}`}>{value}</div>
      <div className="text-[11.5px] text-[#999] font-mono uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </button>
  )
}
