/**
 * Registro central de módulos del sistema.
 * Fuente de verdad compartida por PermisosView, RequireModule y Sidebar.
 *
 * module_key debe coincidir con el moduleKey usado en:
 *   - module_permissions.module_key (BD)
 *   - can(moduleKey) en AuthContext
 *   - RequireModule moduleKey prop
 *   - Sidebar can() calls
 *
 * Convención de claves de capacidad:
 *   - '<mod>'           → acceso al módulo
 *   - '<mod>.<tab>'     → visibilidad de un tab específico
 *   - '<mod>.<x>.manage'→ permiso de escritura (crear/editar/eliminar)
 *
 * Defaults (sin reglas configuradas) = acceso libre para todos los autenticados.
 * Admin siempre pasa. Ver migración seed para los defaults iniciales.
 */
export const MODULES = [
  {
    key: 'proyectos',
    label: 'Proyectos',
    routePrefix: '/proyectos',
    description: 'Gestión de proyectos y fases',
    tabs: [],
    manageActions: [{ key: 'proyectos.manage', label: 'Crear / editar / eliminar proyectos' }],
  },
  {
    key: 'tickets',
    label: 'Soporte Técnico',
    routePrefix: '/tickets',
    description: 'Sistema de tickets de soporte',
    tabs: [],
    manageActions: [{ key: 'tickets.manage', label: 'Crear y gestionar tickets' }],
  },
  {
    key: 'ads',
    label: 'Campañas',
    routePrefix: '/ads',
    description: 'Campañas publicitarias y tácticas',
    tabs: [],
    manageActions: [{ key: 'ads.manage', label: 'Crear / editar / eliminar campañas' }],
  },
  {
    key: 'tareas',
    label: 'Gestión de Tareas',
    routePrefix: '/tareas',
    description: 'Gestión de tareas de control de calidad',
    tabs: [
      { key: 'team', label: 'Dashboard' },
      { key: 'base', label: 'Base' },
      { key: 'standup', label: 'Stand-up' },
      { key: 'fijas', label: 'Tareas Fijas' },
      { key: 'pautas', label: 'Pautas' },
      { key: 'chequeo', label: 'Chequeo' },
    ],
    manageActions: [
      { key: 'tareas.manage', label: 'Crear / editar / eliminar tareas' },
      { key: 'tareas.fijas.manage', label: 'Tildar tareas fijas' },
      { key: 'audiovisual.manage', label: 'Solicitar / editar pautas audiovisuales' },
      { key: 'audiovisual.coordina', label: 'Agendar / aprobar pautas audiovisuales' },
      {
        key: 'audiovisual.notificaciones',
        label: 'Recibir notificaciones de pautas audiovisuales',
      },
      { key: 'audiovisual.ver_todo', label: 'Ver pautas audiovisuales de todas las líneas' },
      {
        key: 'audiovisual.piezas',
        label: 'Gestionar piezas y editores de pautas realizadas',
      },
      { key: 'chequeo.manage', label: 'Registrar fechas de última publicación (Chequeo)' },
      { key: 'chequeo.ver_todo', label: 'Ver Chequeo de todas las líneas' },
    ],
  },
  {
    key: 'cnp',
    label: 'CNP',
    routePrefix: '/cnp',
    description: 'Contenido No Planificado — solicitudes de clientes fuera de la planificación',
    tabs: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'base', label: 'Base' },
    ],
    manageActions: [
      { key: 'cnp.manage', label: 'Crear / editar / eliminar CNP' },
      { key: 'cnp.print.approve', label: 'Aprobar impresión de CNP (Paola / Stephanie)' },
    ],
  },
  {
    key: 'empresa',
    label: 'Empresa',
    routePrefix: '/empresa',
    description: 'Organización, empleados, clientes y líneas',
    tabs: [
      { key: 'general', label: 'Inicio' },
      { key: 'departamentos', label: 'Departamentos' },
      { key: 'empleados', label: 'Empleados' },
      { key: 'preguntas', label: 'Preguntas' },
      { key: 'clientes', label: 'Clientes' },
      { key: 'lineas', label: 'Líneas' },
      { key: 'permisos', label: 'Permisos' },
    ],
    manageActions: [
      { key: 'empresa.clientes.manage', label: 'Modificar clientes' },
      { key: 'empresa.lineas.manage', label: 'Modificar líneas' },
      { key: 'empresa.empleados.manage', label: 'Crear / editar / archivar empleados' },
      { key: 'empresa.vacaciones.manage', label: 'Asignar / confirmar / eliminar vacaciones' },
      {
        key: 'empresa.empleados.sensible',
        label: 'Ver sueldos y niveles de acceso de empleados',
      },
      {
        key: 'empresa.calendario.ver_todo',
        label: 'Ver el calendario de toda la empresa (Inicio)',
      },
    ],
  },
  {
    key: 'evaluaciones',
    label: 'Evaluaciones',
    routePrefix: '/evaluaciones',
    description: 'Evaluaciones de desempeño del equipo',
    tabs: [
      { key: 'mi-desempeno', label: 'Mi Desempeño' },
      { key: 'desempeno', label: 'Desempeño' },
      { key: 'historial', label: 'Historial (evaluaciones manuales, solo lectura)' },
    ],
    manageActions: [
      { key: 'evaluaciones.ver_todo', label: 'Ver el desempeño de todos los empleados + ranking' },
      { key: 'evaluaciones.recalcular', label: 'Recalcular el desempeño de un mes cerrado' },
      { key: 'evaluaciones.perfiles.manage', label: 'Configurar los perfiles de peso por cargo' },
      {
        key: 'evaluaciones.evaluar',
        label: 'Evaluar mensualmente los criterios subjetivos por cargo',
      },
    ],
  },
  {
    key: 'reportes',
    label: 'Reportes',
    routePrefix: '/reportes',
    description: 'Métricas y reportes por línea',
    tabs: [{ key: 'dashboard', label: 'Dashboard' }],
    manageActions: [
      { key: 'reportes.manage', label: 'Editar / importar reportes' },
      { key: 'reportes.close', label: 'Cerrar reportes de cualquier línea' },
    ],
  },
  {
    key: 'monitor_uso',
    label: 'Monitor de uso',
    routePrefix: '/monitor-uso',
    description:
      'Auditoría de uso del sistema por línea operativa — vista de dirección (conteos, semáforo relativo y narrativa)',
    tabs: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'graficas', label: 'Gráficas' },
    ],
    manageActions: [],
  },
  {
    key: 'reuniones',
    label: 'Reuniones',
    routePrefix: '/reuniones',
    description: 'Calendario de reuniones con clientes y empleados',
    tabs: [],
    manageActions: [{ key: 'reuniones.manage', label: 'Crear / editar / eliminar reuniones' }],
  },
  {
    key: 'leads',
    label: 'Leads',
    routePrefix: '/leads',
    description: 'Leads del formulario de contacto de la web',
    tabs: [],
    manageActions: [{ key: 'leads.manage', label: 'Cambiar estado de leads' }],
  },
]

/** Mapa rápido key → módulo */
export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]))

/**
 * Devuelve todas las claves de capacidad de un módulo en orden:
 *   1. Acceso al módulo   (key: mod.key)
 *   2. Tabs "ver"         (key: mod.key + '.' + tab.key)
 *   3. Acciones "manage"  (key: action.key, isManage: true)
 *
 * @param {object} mod - Entrada de MODULES
 * @returns {Array<{ key: string, label: string, isManage?: boolean }>}
 */
export function capabilitiesForModule(mod) {
  const caps = [{ key: mod.key, label: `Acceso al módulo` }]
  for (const tab of mod.tabs ?? []) {
    caps.push({ key: `${mod.key}.${tab.key}`, label: `Ver: ${tab.label}` })
  }
  for (const action of mod.manageActions ?? []) {
    caps.push({ key: action.key, label: action.label, isManage: true })
  }
  return caps
}
