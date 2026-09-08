import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DepartmentsView from '../components/empresa/DepartmentsView'
import EmployeesView from '../components/empresa/EmployeesView'
import QuestionsView from '../components/empresa/QuestionsView'
import ClientsView from '../components/empresa/ClientsView'
import LinesView from '../components/empresa/LinesView'
import PermisosView from '../components/empresa/PermisosView'
import ScoreProfilesPanel from '../components/empresa/ScoreProfilesPanel'
import CriteriaByPositionPanel from '../components/empresa/CriteriaByPositionPanel'

// `capability` opcional: por defecto un tab se gatea con `empresa.<key>`, pero
// "Perfiles de Desempeño" pertenece conceptualmente a Evaluaciones (mismo esquema de
// capabilities que el resto de ese módulo, ver ARQUITECTURA.md §2.7) aunque su UI vive
// en Empresa junto a los otros ajustes de configuración organizacional.
const ALL_TABS = [
  { key: 'general', label: 'Inicio', path: '/empresa' },
  { key: 'lineas', label: 'Líneas', path: '/empresa/lineas' },
  { key: 'departamentos', label: 'Departamentos', path: '/empresa/departamentos' },
  { key: 'empleados', label: 'Empleados', path: '/empresa/empleados' },
  { key: 'preguntas', label: 'Preguntas', path: '/empresa/preguntas' },
  { key: 'clientes', label: 'Clientes', path: '/empresa/clientes' },
  {
    key: 'desempeno-perfiles',
    label: 'Perfiles de Desempeño',
    path: '/empresa/desempeno-perfiles',
    capability: 'evaluaciones.perfiles.manage',
  },
  { key: 'permisos', label: 'Permisos', path: '/empresa/permisos' },
]

function tabCapability(key) {
  return ALL_TABS.find((t) => t.key === key)?.capability ?? `empresa.${key}`
}

function pathToKey(pathname) {
  if (pathname.startsWith('/empresa/departamentos')) return 'departamentos'
  if (pathname.startsWith('/empresa/empleados')) return 'empleados'
  if (pathname.startsWith('/empresa/preguntas')) return 'preguntas'
  if (pathname.startsWith('/empresa/clientes')) return 'clientes'
  if (pathname.startsWith('/empresa/desempeno-perfiles')) return 'desempeno-perfiles'
  if (pathname.startsWith('/empresa/lineas')) return 'lineas'
  if (pathname.startsWith('/empresa/permisos')) return 'permisos'
  return 'general'
}

export default function EmpresaPage() {
  const { userProfile, can = () => true } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Cada tab se muestra solo si el usuario tiene la capacidad correspondiente
  const tabs = ALL_TABS.filter((t) => can(t.capability ?? `empresa.${t.key}`))
  const activeKey = pathToKey(location.pathname)

  // Redirigir si el usuario no tiene acceso a la ruta activa
  useEffect(() => {
    if (userProfile == null) return
    if (!can(tabCapability(activeKey))) {
      navigate('/empresa', { replace: true })
    }
  }, [activeKey, can, navigate, userProfile])

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Empresa</h1>
            <p className="text-[15px] text-[#888] mt-0.5">Organización · Equipos · Documentos</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 mb-6 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[14px] font-semibold transition-all ${
                activeKey === tab.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido por tab */}
        {activeKey === 'general' && can('empresa.general') && (
          <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
            <p className="text-[17px] font-semibold text-[#888] mb-1">Próximamente</p>
            <p className="text-[15px] text-[#bbb]">
              Documentos, onboarding y recursos de la empresa.
            </p>
          </div>
        )}

        {activeKey === 'departamentos' && can('empresa.departamentos') && (
          <DepartmentsView companyId={userProfile.company_id} />
        )}

        {activeKey === 'empleados' && can('empresa.empleados') && (
          <EmployeesView companyId={userProfile.company_id} />
        )}

        {activeKey === 'preguntas' && can('empresa.preguntas') && (
          <QuestionsView companyId={userProfile.company_id} />
        )}

        {activeKey === 'clientes' && can('empresa.clientes') && (
          <ClientsView
            companyId={userProfile.company_id}
            canManage={can('empresa.clientes.manage')}
          />
        )}

        {activeKey === 'lineas' && can('empresa.lineas') && (
          <LinesView companyId={userProfile.company_id} canManage={can('empresa.lineas.manage')} />
        )}

        {activeKey === 'desempeno-perfiles' && can('evaluaciones.perfiles.manage') && (
          <div className="space-y-10">
            <div>
              <h2 className="text-[15.5px] font-bold text-[#111] mb-3">
                Pesos del score automático
              </h2>
              <ScoreProfilesPanel companyId={userProfile.company_id} userId={userProfile.user_id} />
            </div>
            <div>
              <h2 className="text-[15.5px] font-bold text-[#111] mb-3">
                Criterios de la evaluación del jefe
              </h2>
              <CriteriaByPositionPanel
                companyId={userProfile.company_id}
                userId={userProfile.user_id}
              />
            </div>
          </div>
        )}

        {activeKey === 'permisos' && can('empresa.permisos') && (
          <PermisosView companyId={userProfile.company_id} />
        )}
      </div>
    </main>
  )
}
