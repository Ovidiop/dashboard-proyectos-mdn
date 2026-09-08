import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import MDNLogo from './MDNLogo'
import AvatarUpload from './empresa/AvatarUpload'
import NotificationBell from './notifications/NotificationBell'

const HOME_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path d="M2 7.5 8 2l6 5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M3.5 6.5V13a1 1 0 0 0 1 1H6a.5.5 0 0 0 .5-.5V10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3.5a.5.5 0 0 0 .5.5h1.5a1 1 0 0 0 1-1V6.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
const PROJECTS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1" y="1" width="6" height="6" rx="1.5" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>
)
const TICKET_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 6h14" strokeLinecap="round" />
    <path d="M5 10h6" strokeLinecap="round" />
  </svg>
)
const BELL_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path
      d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 8 1.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M6.5 13a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
  </svg>
)
const CHART_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1" y="8" width="3" height="6" rx="1" />
    <rect x="6" y="5" width="3" height="9" rx="1" />
    <rect x="11" y="2" width="3" height="12" rx="1" />
  </svg>
)
const ADS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path d="M2 11V5l6-3 6 3v6l-6 3-6-3Z" strokeLinejoin="round" />
    <path d="M8 2v12M2 5l6 3 6-3" strokeLinecap="round" />
  </svg>
)
const TASKS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
    <path d="M5 6h6M5 9h4" strokeLinecap="round" />
    <path d="M5 12h2" strokeLinecap="round" />
  </svg>
)
const COMPANY_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1" y="4" width="14" height="10" rx="1.5" />
    <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round" />
    <path d="M1 8h14" strokeLinecap="round" />
  </svg>
)
const EVAL_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
    <path d="M10.5 8.5l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const METRICS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <polyline points="1 12 5 7 8 10 11 5 15 8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1 14h14" strokeLinecap="round" />
  </svg>
)
const MEETINGS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
    <path d="M1.5 6h13" strokeLinecap="round" />
    <path d="M5 1v3M11 1v3" strokeLinecap="round" />
    <path d="M4.5 9h2M4.5 11.5h5" strokeLinecap="round" />
  </svg>
)
function Sidebar() {
  const {
    signOut,
    userProfile,
    refreshProfile,
    can = () => false,
    permissionsLoaded = false,
  } = useAuth()
  // Hasta que los permisos carguen desde BD, ningún módulo gateado aparece (evita flash).
  const canR = permissionsLoaded ? can : () => false
  const [menuOpen, setMenuOpen] = useState(false)
  const avatarInputRef = useRef(null)
  const menuRef = useRef(null)

  async function handleAvatarUploaded(url) {
    if (!userProfile?.user_id) return
    await supabase.from('users').update({ avatar_url: url }).eq('user_id', userProfile.user_id)
    await refreshProfile()
  }

  // Acceso rápido solo para Juan: cambiar su propio nivel/admin sin pasar por Empresa → Empleados.
  // Mismo user_id que CEO_ANALYSIS_USER_IDS (ceoAnalysisAccess.js) — el email de users.email no es confiable.
  const isGodModeUser = userProfile?.user_id === '2d50a4e5-35db-4be5-b27a-a24d1282ce82'

  // Vía Netlify function con service-role: un UPDATE directo con el cliente anon
  // choca con el trigger anti-escalada (is_company_admin() evalúa el admin ACTUAL
  // del caller, así que un no-admin nunca puede tocar admin/access_level ni sobre
  // su propia fila). Ver netlify/functions/self-god-mode.js.
  async function callSelfGodMode(payload) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/self-god-mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
    await refreshProfile()
  }

  async function handleSelfLevelChange(level) {
    if (!userProfile?.user_id) return
    await callSelfGodMode({ access_level: level })
  }

  async function handleSelfAdminToggle(admin) {
    if (!userProfile?.user_id) return
    await callSelfGodMode({ admin })
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const location = useLocation()

  const isHomeRoute = location.pathname === '/'
  const isProjectsRoute = location.pathname === '/proyectos'
  const isTicketsRoute = location.pathname.startsWith('/tickets')

  const isAdsRoute = location.pathname.startsWith('/ads')
  const isTareasRoute = location.pathname.startsWith('/tareas')
  const isTareasFijasRoute = location.pathname.startsWith('/tareas/fijas')
  const isPautasRoute = location.pathname.startsWith('/tareas/pautas')
  const isChequeoRoute = location.pathname.startsWith('/tareas/chequeo')
  const isTareasMainRoute =
    isTareasRoute && !isTareasFijasRoute && !isPautasRoute && !isChequeoRoute
  const isCnpRoute = location.pathname.startsWith('/cnp')
  const isOperacionRoute = isTareasRoute || isCnpRoute
  const [operacionOpen, setOperacionOpen] = useState(isOperacionRoute)
  const isEmpresaRoute = location.pathname.startsWith('/empresa')

  const isMetricasRoute = location.pathname.startsWith('/reportes')
  const isMonitorUsoRoute = location.pathname.startsWith('/monitor-uso')
  const isReunionesRoute = location.pathname.startsWith('/reuniones')
  const isEvalRoute = location.pathname.startsWith('/evaluaciones')
  const evalDesempenoActive = location.pathname === '/evaluaciones'
  const evalMiDesempenoActive = location.pathname === '/evaluaciones/mi-desempeno'
  const evalHistorialActive = location.pathname === '/evaluaciones/historial'
  const [evalOpen, setEvalOpen] = useState(isEvalRoute)

  return (
    <aside className="w-[260px] flex-shrink-0 bg-white border-r border-[#e0ddd4] flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-[#ece9df]">
        <MDNLogo size={72} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-[12px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
          Herramientas
        </p>
        <div className="space-y-0.5">
          {/* Inicio — botón directo */}
          <Link
            to="/"
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
              isHomeRoute
                ? 'bg-[#FFB800] text-[#111]'
                : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isHomeRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {HOME_ICON}
            </span>
            <span className="flex-1">Inicio</span>
          </Link>

          {/* Empresa — botón directo */}
          {canR('empresa') && (
            <Link
              to="/empresa"
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
                isEmpresaRoute
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span className={`flex-shrink-0 ${isEmpresaRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                {COMPANY_ICON}
              </span>
              <span className="flex-1">Empresa</span>
            </Link>
          )}

          {/* Operación — menú desplegable (Gestión de Tareas, CNP, Tareas Fijas, Pautas, Chequeo) */}
          {(canR('tareas') || canR('cnp')) && (
            <>
              <button
                onClick={() => setOperacionOpen((o) => !o)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
                  isOperacionRoute && !operacionOpen
                    ? 'bg-[#FFB800] text-[#111]'
                    : isOperacionRoute
                      ? 'text-[#111] bg-[#f5f3eb]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span
                  className={`flex-shrink-0 ${isOperacionRoute ? 'text-[#111]' : 'text-[#666]'}`}
                >
                  {TASKS_ICON}
                </span>
                <span className="flex-1">Operación</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className={`flex-shrink-0 transition-transform duration-200 ${operacionOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {operacionOpen && (
                <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
                  {/* Gestión de Tareas */}
                  {canR('tareas') && (
                    <Link
                      to="/tareas"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all ${
                        isTareasMainRoute
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${isTareasMainRoute ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        {TASKS_ICON}
                      </span>
                      <span className="flex-1">Gestión de Tareas</span>
                    </Link>
                  )}

                  {/* CNP */}
                  {canR('cnp') && (
                    <Link
                      to="/cnp"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all ${
                        isCnpRoute
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${isCnpRoute ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <path
                            d="M9 1.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V5.5L9 1.5Z"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 1.5V5a1 1 0 0 0 1 1h3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M5 9.5h6M5 12h4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="flex-1">CNP</span>
                    </Link>
                  )}

                  {/* Tareas Fijas */}
                  {canR('tareas') && canR('tareas.fijas') && (
                    <Link
                      to="/tareas/fijas"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all ${
                        isTareasFijasRoute
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${isTareasFijasRoute ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <rect x="2" y="2" width="12" height="12" rx="1.5" />
                          <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="flex-1">Tareas Fijas</span>
                    </Link>
                  )}

                  {/* Pautas */}
                  {canR('tareas') && canR('tareas.pautas') && (
                    <Link
                      to="/tareas/pautas"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all ${
                        isPautasRoute
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${isPautasRoute ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <rect x="2" y="3" width="12" height="11" rx="1.5" />
                          <path d="M2 6.5h12M5.5 2v2.4M10.5 2v2.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="flex-1">Pautas</span>
                    </Link>
                  )}

                  {/* Chequeo */}
                  {canR('tareas') && canR('tareas.chequeo') && (
                    <Link
                      to="/tareas/chequeo"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all ${
                        isChequeoRoute
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${isChequeoRoute ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <circle cx="8" cy="8" r="6.2" />
                          <path
                            d="M8 4.6v3.6l2.4 1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">Chequeo</span>
                    </Link>
                  )}
                </div>
              )}
            </>
          )}

          {/* Campañas — botón directo */}
          {canR('ads') && (
            <Link
              to="/ads"
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
                isAdsRoute
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span className={`flex-shrink-0 ${isAdsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                {ADS_ICON}
              </span>
              <span className="flex-1">Campañas</span>
            </Link>
          )}

          {/* Reuniones — botón directo */}
          {canR('reuniones') && (
            <Link
              to="/reuniones"
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
                isReunionesRoute
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span className={`flex-shrink-0 ${isReunionesRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                {MEETINGS_ICON}
              </span>
              <span className="flex-1">Reuniones</span>
            </Link>
          )}

          {/* Leads — oculto del sidebar por ahora; ruta y módulo siguen activos */}

          {/* Proyectos — botón directo */}
          <Link
            to="/proyectos"
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
              isProjectsRoute
                ? 'bg-[#FFB800] text-[#111]'
                : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isProjectsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {PROJECTS_ICON}
            </span>
            <span className="flex-1">Proyectos</span>
          </Link>

          {/* Evaluaciones — menú desplegable */}
          {canR('evaluaciones') && (
            <>
              <button
                onClick={() => setEvalOpen((o) => !o)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
                  isEvalRoute && !evalOpen
                    ? 'bg-[#FFB800] text-[#111]'
                    : isEvalRoute
                      ? 'text-[#111] bg-[#f5f3eb]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${isEvalRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                  {EVAL_ICON}
                </span>
                <span className="flex-1">Evaluaciones</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className={`flex-shrink-0 transition-transform duration-200 ${evalOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {evalOpen && (
                <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
                  {/* Mi Desempeño — score automático propio, visible a todos */}
                  {canR('evaluaciones.mi-desempeno') && (
                    <Link
                      to="/evaluaciones/mi-desempeno"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                        evalMiDesempenoActive
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${evalMiDesempenoActive ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        {CHART_ICON}
                      </span>
                      <span className="flex-1">Mi Desempeño</span>
                    </Link>
                  )}

                  {/* Desempeño — score automático del equipo (lista + ranking), nivel 2+ */}
                  {canR('evaluaciones.desempeno') && (
                    <Link
                      to="/evaluaciones"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                        evalDesempenoActive
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${evalDesempenoActive ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        {EVAL_ICON}
                      </span>
                      <span className="flex-1">Desempeño</span>
                    </Link>
                  )}

                  {/* Historial — evaluaciones manuales retiradas, solo lectura */}
                  {canR('evaluaciones.historial') && (
                    <Link
                      to="/evaluaciones/historial"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                        evalHistorialActive
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 ${evalHistorialActive ? 'text-[#111]' : 'text-[#666]'}`}
                      >
                        {CHART_ICON}
                      </span>
                      <span className="flex-1">Historial</span>
                    </Link>
                  )}
                </div>
              )}
            </>
          )}

          {/* Reportes — botón directo */}
          {canR('reportes') && (
            <Link
              to="/reportes"
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
                isMetricasRoute
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span className={`flex-shrink-0 ${isMetricasRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                {METRICS_ICON}
              </span>
              <span className="flex-1">Reportes</span>
            </Link>
          )}

          {/* Monitor de uso — botón directo */}
          {canR('monitor_uso') && (
            <Link
              to="/monitor-uso"
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all ${
                isMonitorUsoRoute
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span
                className={`flex-shrink-0 ${isMonitorUsoRoute ? 'text-[#111]' : 'text-[#666]'}`}
              >
                {CHART_ICON}
              </span>
              <span className="flex-1">Monitor de uso</span>
            </Link>
          )}
        </div>
      </nav>

      {/* Soporte Técnico — fijado al fondo, encima del perfil */}
      {canR('tickets') && (
        <div className="px-3 py-3 border-t border-[#ece9df]">
          <Link
            to="/tickets"
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
              isTicketsRoute
                ? 'bg-[#FFB800] text-[#111]'
                : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isTicketsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {TICKET_ICON}
            </span>
            <span className="flex-1">Soporte Técnico</span>
          </Link>
        </div>
      )}

      {/* User menu */}
      <div className="px-4 pb-5 pt-3 border-t border-[#ece9df] relative" ref={menuRef}>
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          {userProfile?.avatar_url ? (
            <img
              src={userProfile.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 bg-[#FFB800] flex items-center justify-center">
              <span className="text-[15px] font-bold text-[#111]">
                {(
                  (userProfile?.first_name?.[0] ?? '') + (userProfile?.last_name?.[0] ?? '')
                ).toUpperCase() || '?'}
              </span>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#111] truncate leading-snug">
              {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : '—'}
            </p>
            <p className="text-[13px] text-[#888] truncate leading-snug">
              {userProfile?.email ?? ''}
            </p>
            {(userProfile?.department?.department_name || userProfile?.position?.position_name) && (
              <p className="text-[12.5px] font-mono text-[#666] truncate leading-snug mt-0.5">
                {[userProfile.department?.department_name, userProfile.position?.position_name]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          {/* Notification bell */}
          <NotificationBell />

          {/* 3-dot trigger */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Opciones de usuario"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>
        </div>

        {/* Popover */}
        {menuOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => {
                setMenuOpen(false)
                avatarInputRef.current?.click()
              }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-[#444] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors text-left"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <circle cx="8" cy="6" r="3.5" />
                <path d="M1.5 14c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" strokeLinecap="round" />
              </svg>
              Cambiar foto
            </button>

            {isGodModeUser && (
              <div className="border-t border-[#ece9df] px-4 py-3">
                <p className="text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#999] mb-2">
                  Modo dios
                </p>
                <select
                  className="input-base mb-2.5"
                  value={userProfile.access_level ?? 1}
                  onChange={(e) => handleSelfLevelChange(Number(e.target.value))}
                >
                  <option value={1}>Nivel 1</option>
                  <option value={2}>Nivel 2</option>
                  <option value={3}>Nivel 3</option>
                  <option value={4}>Nivel 4</option>
                </select>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={userProfile.admin === true}
                    onClick={() => handleSelfAdminToggle(!userProfile.admin)}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      userProfile.admin ? 'bg-[#FFB800]' : 'bg-[#d8d4c8]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        userProfile.admin ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                  <span className="text-[15px] text-[#555]">Administrador</span>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-[#444] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors text-left"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path
                  d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}

        {/* AvatarUpload del usuario propio (trigger oculto; el botón "Cambiar foto" dispara avatarInputRef) */}
        {userProfile && (
          <AvatarUpload
            user={userProfile}
            onUploaded={handleAvatarUploaded}
            size={0}
            label=""
            triggerRef={avatarInputRef}
          />
        )}
      </div>
    </aside>
  )
}

export default Sidebar
