import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { canViewEmployeeFicha } from '../../lib/permissions'

/**
 * Cuerpo embebible de la ficha de un empleado (users). Sin overlay, botón X
 * ni listener de Escape — eso vive en el contenedor (EmployeeInfoModal
 * standalone, o LineFichaModal en drill-down).
 * Props:
 *   employee — objeto completo de users con joins position y department
 *   line     — objeto de metric_lines (id, name, color) — la línea del empleado
 *   onClose  — cierre total del modal contenedor (para acciones close-then-navigate)
 */
export default function EmployeeFichaContent({ employee, line, onClose }) {
  const navigate = useNavigate()
  const { can = () => true, userProfile } = useAuth()

  if (!canViewEmployeeFicha(userProfile, employee.user_id)) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <p className="text-[13.5px] text-[#bbb] text-center">
          No tienes permiso para ver la ficha de esta persona.
        </p>
      </div>
    )
  }

  const initials = `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase()
  const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()

  function fmtDate(dateStr) {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const ACCESS_LABELS = { 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3', 4: 'Nivel 4' }
  const accessLabel = ACCESS_LABELS[employee.access_level] ?? `Nivel ${employee.access_level}`

  const positionFunctions = employee.position?.position_functions ?? []
  const positionDescription = employee.position?.position_description ?? null

  return (
    <>
      {/* Header — foto protagonista centrada */}
      <div className="flex-shrink-0 flex flex-col items-center px-6 pt-7 pb-5 border-b border-[#ece9df]">
        {/* Avatar grande */}
        {employee.avatar_url ? (
          <img
            src={employee.avatar_url}
            alt={fullName}
            className="w-24 h-24 rounded-full object-cover border-2 border-[#e0ddd4] shadow-md mb-3"
          />
        ) : (
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-[32px] font-bold text-white shadow-md mb-3 flex-shrink-0"
            style={{ background: line?.color ?? '#888' }}
          >
            {initials}
          </div>
        )}

        {/* Nombre y cargo */}
        <h2 className="text-[20px] font-bold text-[#111] text-center leading-snug">{fullName}</h2>
        {employee.position?.position_name && (
          <p className="text-[14px] text-[#888] text-center mt-0.5">
            {employee.position.position_name}
          </p>
        )}

        {/* Badge de línea */}
        {line && (
          <span
            className="inline-block mt-2 px-3 py-0.5 rounded-full text-[12px] font-semibold"
            style={{ background: line.color + '22', color: line.color }}
          >
            {line.name}
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
        {/* Departamento */}
        {employee.department?.department_name && (
          <InfoItem label="Departamento">{employee.department.department_name}</InfoItem>
        )}

        {/* Email */}
        {employee.email && (
          <InfoItem label="Correo">
            <a
              href={`mailto:${employee.email}`}
              className="text-[#555] hover:text-[#111] hover:underline transition-colors"
            >
              {employee.email}
            </a>
          </InfoItem>
        )}

        {/* Teléfono */}
        {employee.phone_number && (
          <InfoItem label="Teléfono">
            <a
              href={`tel:${employee.phone_number}`}
              className="text-[#555] hover:text-[#111] hover:underline transition-colors"
            >
              {employee.phone_number}
            </a>
          </InfoItem>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Fecha de ingreso */}
          <InfoItem label="Fecha de ingreso">{fmtDate(employee.hire_date)}</InfoItem>
          {/* Cumpleaños */}
          <InfoItem label="Cumpleaños">{fmtDate(employee.birth_date)}</InfoItem>
        </div>

        {/* Nivel de acceso */}
        <InfoItem label="Nivel de acceso">
          <span className="inline-flex items-center gap-1">
            {accessLabel}
            {employee.admin && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-[#FAB51A22] text-[#b45309]">
                Admin
              </span>
            )}
          </span>
        </InfoItem>

        {/* Descripción del cargo */}
        {positionDescription && (
          <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
            <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1.5">
              Descripción del cargo
            </p>
            <p className="text-[14px] text-[#444] leading-relaxed">{positionDescription}</p>
          </div>
        )}

        {/* Funciones del cargo */}
        {positionFunctions.length > 0 && (
          <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
            <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
              Funciones
            </p>
            <ul className="space-y-1.5">
              {positionFunctions.map((fn, i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] text-[#444]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#bbb] flex-shrink-0 mt-[6px]" />
                  {fn}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Acciones */}
        {can('evaluaciones') && (
          <div className="pt-1 border-t border-[#ece9df]">
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate(`/evaluaciones/empleado/${employee.user_id}`)
              }}
              className="flex items-center gap-2 text-[14px] font-semibold text-[#555] hover:text-[#111] transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ver perfil completo
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function InfoItem({ label, children }) {
  return (
    <div>
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-0.5">
        {label}
      </p>
      <div className="text-[14px] text-[#555]">{children ?? '—'}</div>
    </div>
  )
}
