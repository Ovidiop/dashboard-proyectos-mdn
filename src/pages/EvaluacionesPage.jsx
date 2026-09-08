import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import EmployeeProfileView from '../components/evaluaciones/EmployeeProfileView'
import DesempenoView from '../components/evaluaciones/DesempenoView'
import MiDesempenoView from '../components/evaluaciones/MiDesempenoView'
import HistorialLegacyView from '../components/evaluaciones/HistorialLegacyView'

// Evaluación automática de desempeño (ver ARQUITECTURA.md §2.7). El flujo manual
// (Empleados/Resumen/Mi Perfil/Mi Perfil v2 + EvaluationModal) se retiró en la fase
// F6 — su historial sigue disponible en modo solo lectura en el tab "Historial".
const ALL_TABS = [
  { key: 'mi-desempeno', label: 'Mi Desempeño', path: '/evaluaciones/mi-desempeno' },
  { key: 'desempeno', label: 'Desempeño', path: '/evaluaciones' },
  { key: 'historial', label: 'Historial', path: '/evaluaciones/historial' },
]

function pathToKey(pathname) {
  if (pathname.startsWith('/evaluaciones/mi-desempeno')) return 'mi-desempeno'
  if (pathname.startsWith('/evaluaciones/historial')) return 'historial'
  return 'desempeno'
}

export default function EvaluacionesPage() {
  const { userProfile, can = () => true } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { id: employeeId } = useParams()

  const activeKey = pathToKey(location.pathname)
  const isProfileView = location.pathname.startsWith('/evaluaciones/empleado/')
  const isMiDesempenoView = location.pathname.startsWith('/evaluaciones/mi-desempeno')
  const isHistorialView = location.pathname.startsWith('/evaluaciones/historial')

  // Visibilidad config-driven de tabs
  const visibleTabs = ALL_TABS.filter((t) => can(`evaluaciones.${t.key}`))

  // Si el usuario no puede ver el tab activo, redirigir a su propio desempeño
  // (siempre visible — cada quien ve el suyo).
  useEffect(() => {
    if (userProfile == null || isMiDesempenoView || isProfileView) return
    if (!can(`evaluaciones.${activeKey}`)) {
      navigate('/evaluaciones/mi-desempeno', { replace: true })
    }
  }, [can, navigate, userProfile, activeKey, isMiDesempenoView, isProfileView])

  // El perfil de OTRO empleado (/evaluaciones/empleado/:id, historial legacy)
  // solo puede verlo el propio empleado o quien tenga 'evaluaciones.ver_todo'
  // (ver hallazgo 1.9 de plan.md — nunca abrir el historial completo de un
  // compañero a cualquiera con acceso al módulo).
  useEffect(() => {
    if (userProfile == null || !isProfileView) return
    if (employeeId === userProfile.user_id) return
    if (!can('evaluaciones.ver_todo')) {
      navigate('/evaluaciones/mi-desempeno', { replace: true })
    }
  }, [can, navigate, userProfile, isProfileView, employeeId])

  if (!userProfile) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Evaluaciones</h1>
            <p className="text-[15px] text-[#888] mt-0.5">Desempeño · Historial</p>
          </div>
        </div>

        {/* Tab switcher — oculto en perfil de empleado ajeno */}
        {visibleTabs.length > 0 && !isProfileView && (
          <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path)}
                className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                  activeKey === tab.key
                    ? 'bg-[#111] text-white'
                    : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Contenido */}
        {isProfileView ? (
          <EmployeeProfileView employeeId={employeeId} />
        ) : isMiDesempenoView ? (
          <MiDesempenoView userId={userProfile.user_id} companyId={userProfile.company_id} />
        ) : isHistorialView ? (
          <HistorialLegacyView companyId={userProfile.company_id} />
        ) : (
          <DesempenoView />
        )}
      </div>
    </main>
  )
}
