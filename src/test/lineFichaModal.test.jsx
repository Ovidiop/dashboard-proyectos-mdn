/**
 * Tests de la ficha de línea en Empresa → Líneas:
 * - LinesView: click en el card abre LineFichaModal; los controles de gestión no
 * - LineFichaModal: drill-down a empleado/cliente en un solo modal con "Volver",
 *   Escape sube un nivel (en la raíz cierra), X cierra desde cualquier nivel,
 *   gating financiero heredado de ClientFichaContent
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ── Mocks globales ─────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: {
      user_id: 'u-1',
      company_id: 'co-1',
      access_level: 4,
      admin: true,
      first_name: 'Admin',
      last_name: 'Test',
    },
    can: () => true,
    signOut: vi.fn(),
  })),
}))

import { useAuth } from '../context/AuthContext'

// Stubs de los modales de gestión de LinesView (no son objeto de estos tests)
vi.mock('../components/empresa/LineModal', () => ({
  default: () => <div data-testid="line-modal" />,
}))
vi.mock('../components/empresa/LineMetasModal', () => ({
  default: () => <div data-testid="line-metas-modal" />,
}))
vi.mock('../components/common/ConfirmDeleteDialog', () => ({
  default: () => <div data-testid="confirm-delete-dialog" />,
}))

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MOCK_LINE = {
  id: 'l-1',
  name: 'Georgina',
  color: '#FAB51A',
  member_user_ids: ['u-2'],
  lead_user_id: null,
  sort_order: 0,
}

const MOCK_EMPLOYEE = {
  user_id: 'u-2',
  first_name: 'María',
  last_name: 'González',
  avatar_url: null,
  position: {
    position_name: 'Diseñadora',
    position_description: 'Diseña piezas gráficas',
    position_functions: ['Crear artes'],
  },
  department: { department_name: 'Diseño' },
  email: 'maria@mdn.com',
  phone_number: null,
  hire_date: null,
  birth_date: null,
  access_level: 2,
  admin: false,
}

// Empleado NO asignado a MOCK_LINE — disponible para agregar desde la ficha
const MOCK_EMPLOYEE_2 = {
  user_id: 'u-3',
  first_name: 'Carlos',
  last_name: 'Pérez',
  avatar_url: null,
  position: {
    position_name: 'Redactor',
    position_description: 'Escribe contenido',
    position_functions: [],
  },
  department: { department_name: 'Redes' },
  email: 'carlos@mdn.com',
  phone_number: null,
  hire_date: null,
  birth_date: null,
  access_level: 1,
  admin: false,
}

const MOCK_CLIENT = {
  id: 'c-1',
  name: 'Pepsi',
  monthly_fee: 1500,
  payment_day: 5,
  logo_url: null,
  line_id: 'l-1',
  website: 'https://pepsi.com',
  contacts: [{ name: 'Juan Pérez', role: 'Gerente', birth_day: 5, birth_month: 3 }],
  social_links: [],
  mdn_since: null,
  anniversary_date: null,
}

// Reportes del año: mes actual fijo (CURRENT_MONTH) y el mes anterior de la
// línea l-1, más un reporte de otra línea en el mes actual — para probar
// filtrado por línea y el criterio de "mes actual fijo" (no "último con datos").
const CURRENT_YEAR = new Date().getFullYear()
const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const _testNow = new Date()
const CURRENT_MONTH = _testNow.getMonth() + 1
const PREV_MONTH_DATE = new Date(_testNow.getFullYear(), _testNow.getMonth() - 1, 1)
const PREV_YEAR = PREV_MONTH_DATE.getFullYear()
const PREV_MONTH = PREV_MONTH_DATE.getMonth() + 1

const MOCK_REPORTS = [
  {
    id: 'r-1',
    line_id: 'l-1',
    year: PREV_YEAR,
    month: PREV_MONTH,
    data: {
      finanzas: {
        ingresos: [{ id: 'i-0', descripcion: 'Viejo', monto: 500 }],
        gastosOperativos: [],
        sueldos: [],
        otrosGastos: [],
      },
    },
  },
  {
    id: 'r-2',
    line_id: 'l-1',
    year: CURRENT_YEAR,
    month: CURRENT_MONTH,
    data: {
      finanzas: {
        ingresos: [{ id: 'i-1', descripcion: 'Pepsi', monto: 1000 }],
        gastosOperativos: [{ id: 'g-1', descripcion: 'Hosting', monto: 400 }],
        sueldos: [],
        otrosGastos: [],
      },
    },
  },
  {
    id: 'r-3',
    line_id: 'l-otra',
    year: CURRENT_YEAR,
    month: CURRENT_MONTH,
    data: {
      finanzas: {
        ingresos: [{ id: 'i-9', descripcion: 'Ajena', monto: 9999 }],
        gastosOperativos: [],
        sueldos: [],
        otrosGastos: [],
      },
    },
  },
]

// Mock de metricsApi centralizado
const mockLoadLines = vi.fn().mockResolvedValue({ data: [MOCK_LINE], error: null })
const mockLoadCompanyUsers = vi.fn().mockResolvedValue({
  data: [{ user_id: 'u-2', first_name: 'María', last_name: 'González', avatar_url: null }],
  error: null,
})
const mockLoadCompanyEmployees = vi
  .fn()
  .mockResolvedValue({ data: [MOCK_EMPLOYEE, MOCK_EMPLOYEE_2], error: null })
const mockLoadClients = vi.fn().mockResolvedValue({ data: [MOCK_CLIENT], error: null })
const mockUpdateLine = vi.fn().mockResolvedValue({ data: null, error: null })
const mockDeleteLine = vi.fn().mockResolvedValue({ error: null })
const mockLoadYearReports = vi.fn().mockResolvedValue({ data: MOCK_REPORTS, error: null })
const mockAddLineMember = vi.fn().mockResolvedValue({ data: null, error: null })
const mockRemoveLineMember = vi.fn().mockResolvedValue({ data: null, error: null })
const mockSetLineLeader = vi.fn().mockResolvedValue({ data: null, error: null })
const mockRemoveLineLeader = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: (...a) => mockLoadLines(...a),
  loadCompanyUsers: (...a) => mockLoadCompanyUsers(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  loadClients: (...a) => mockLoadClients(...a),
  updateLine: (...a) => mockUpdateLine(...a),
  deleteLine: (...a) => mockDeleteLine(...a),
  loadYearReports: (...a) => mockLoadYearReports(...a),
  addLineMember: (...a) => mockAddLineMember(...a),
  removeLineMember: (...a) => mockRemoveLineMember(...a),
  setLineLeader: (...a) => mockSetLineLeader(...a),
  removeLineLeader: (...a) => mockRemoveLineLeader(...a),
}))

// calcFinanzas real (suma los montos de los fixtures) + fmtUSD simplificado
vi.mock('../utils/metricsFinance', async (importOriginal) => ({
  ...(await importOriginal()),
  fmtUSD: vi.fn((v) => `$${v}`),
}))

import LinesView from '../components/empresa/LinesView'
import LineFichaModal from '../components/empresa/LineFichaModal'

function wrap(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

/** Expone la ubicación actual del MemoryRouter para assertear navegaciones. */
function LocationSpy() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

async function renderFicha(onClose = vi.fn()) {
  wrap(
    <>
      <LineFichaModal line={MOCK_LINE} companyId="co-1" onClose={onClose} />
      <LocationSpy />
    </>,
  )
  await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
  return onClose
}

beforeEach(() => {
  mockLoadYearReports.mockClear()
  mockUpdateLine.mockClear()
  mockLoadCompanyEmployees.mockClear()
  mockLoadCompanyEmployees.mockResolvedValue({
    data: [MOCK_EMPLOYEE, MOCK_EMPLOYEE_2],
    error: null,
  })
})

afterEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    userProfile: {
      user_id: 'u-1',
      company_id: 'co-1',
      access_level: 4,
      admin: true,
      first_name: 'Admin',
      last_name: 'Test',
    },
    can: () => true,
    signOut: vi.fn(),
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. Apertura desde LinesView
// ══════════════════════════════════════════════════════════════════════════════

describe('LinesView — apertura de la ficha de línea', () => {
  async function renderLines() {
    wrap(<LinesView companyId="co-1" canManage={true} />)
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
  }

  it('el título del card abre la ficha con contadores y listas', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.getByTitle('Ver información de María González')).toBeInTheDocument()
    expect(screen.getByTitle('Ver ficha de Pepsi')).toBeInTheDocument()
  })

  it('el click en el cuerpo del card (fuera de controles) abre la ficha', async () => {
    await renderLines()
    // "Marcas" es la etiqueta de la stat en la card — <p> sin interactividad, burbujea al card
    fireEvent.click(screen.getByText('Marcas'))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
  })

  it('"Configurar metas" abre su modal y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Configurar metas' }))
    expect(screen.getByTestId('line-metas-modal')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('"Editar línea" abre su modal y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Editar línea' }))
    expect(screen.getByTestId('line-modal')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('"Eliminar línea" abre el diálogo de confirmación y NO la ficha', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar línea' }))
    expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('el click en el label de stat "Empleados" abre la ficha', async () => {
    await renderLines()
    // "Empleados" es la etiqueta de la stat en la card — <p> sin interactividad, burbujea al card
    fireEvent.click(screen.getByText('Empleados'))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
  })

  it('la ficha muestra el selector "Agregar empleado" cuando canManage', async () => {
    await renderLines()
    await userEvent.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(
      screen.getByRole('combobox', { name: 'Agregar empleado a Georgina' }),
    ).toBeInTheDocument()
  })

  it('asignar empleado desde la ficha llama a addLineMember', async () => {
    const user = userEvent.setup()
    await renderLines()
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Agregar empleado a Georgina' }),
      ).toBeInTheDocument(),
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agregar empleado a Georgina' }),
      'u-3',
    )

    await waitFor(() => {
      expect(mockAddLineMember).toHaveBeenCalledWith('l-1', 'u-3')
    })
  })

  it('quitar empleado desde la ficha llama a removeLineMember', async () => {
    const user = userEvent.setup()
    await renderLines()
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('María González')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Quitar a María González de la línea' }))

    await waitFor(() => {
      expect(mockRemoveLineMember).toHaveBeenCalledWith('l-1', 'u-2')
    })
  })

  it('marcar a un miembro como jefa de línea llama a setLineLeader', async () => {
    const user = userEvent.setup()
    await renderLines()
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('María González')).toBeInTheDocument())

    await user.click(
      screen.getByRole('button', { name: 'Marcar a María González como jefa de línea' }),
    )

    await waitFor(() => {
      expect(mockSetLineLeader).toHaveBeenCalledWith('l-1', 'u-2')
    })
    // Tras marcarla, el botón cambia a la variante "quitar"
    expect(
      screen.getByRole('button', { name: 'Quitar a María González como jefa de línea' }),
    ).toBeInTheDocument()
  })

  it('quitar el liderazgo de la jefa actual llama a removeLineLeader', async () => {
    const user = userEvent.setup()
    mockLoadLines.mockResolvedValueOnce({
      data: [{ ...MOCK_LINE, lead_user_id: 'u-2' }],
      error: null,
    })
    await renderLines()
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Georgina' }))
    await waitFor(() => expect(screen.getByText('María González')).toBeInTheDocument())

    await user.click(
      screen.getByRole('button', { name: 'Quitar a María González como jefa de línea' }),
    )

    await waitFor(() => {
      expect(mockRemoveLineLeader).toHaveBeenCalledWith('l-1', 'u-2')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. LineFichaModal — drill-down
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — drill-down en un solo modal', () => {
  it('muestra la vista raíz con miembros y clientes', async () => {
    await renderFicha()
    expect(screen.getByText('Georgina')).toBeInTheDocument()
    expect(screen.getByText('1 miembro · 1 cliente')).toBeInTheDocument()
    expect(screen.getByText('María González')).toBeInTheDocument()
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
  })

  it('drill-down a empleado y volver', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
    expect(screen.getByText('Diseña piezas gráficas')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Volver a Georgina/ }))
    expect(screen.getByText('Miembros')).toBeInTheDocument()
    expect(screen.queryByText('maria@mdn.com')).not.toBeInTheDocument()
  })

  it('drill-down a cliente y volver', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('pepsi.com')).toBeInTheDocument()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Volver a Georgina/ }))
    expect(screen.getByText('Miembros')).toBeInTheDocument()
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument()
  })

  it('Escape sube un nivel; en la raíz cierra', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByText('Miembros')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el botón X cierra todo desde un drill-down', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('usuario privilegiado ve los datos financieros del cliente en drill-down', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('$1500')).toBeInTheDocument()
    expect(screen.getByText('día 5')).toBeInTheDocument()
  })

  it('usuario no privilegiado NO ve los datos financieros del cliente', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.queryByText('$1500')).not.toBeInTheDocument()
    expect(screen.queryByText('día 5')).not.toBeInTheDocument()
  })

  it('sin canManage el selector de agregar empleado NO aparece en la ficha', async () => {
    // renderFicha no pasa canManage (default false)
    await renderFicha()
    expect(screen.queryByRole('combobox', { name: /Agregar empleado/ })).not.toBeInTheDocument()
  })

  it('sin onSetLeader/onRemoveLeader, el toggle de jefa de línea NO aparece (aunque sí se pueda quitar miembros)', async () => {
    wrap(
      <LineFichaModal
        line={MOCK_LINE}
        companyId="co-1"
        canManage={true}
        onRemoveMember={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('María González')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /jefa de línea/ })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Quitar a María González de la línea' }),
    ).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2b. LineFichaModal — visibilidad de la ficha de empleado por nivel de acceso
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — visibilidad de la ficha de empleado (nivel 1-2 vs propia)', () => {
  it('nivel 2 sobre OTRO miembro: la tarjeta no abre la ficha (queda deshabilitada)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    const card = screen.getByTitle('María González')
    expect(card).toBeDisabled()
    await userEvent.click(card)
    // Sigue en la vista raíz: no se filtró ningún dato de la ficha
    expect(screen.getByText('Miembros')).toBeInTheDocument()
    expect(screen.queryByText('maria@mdn.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Nivel de acceso')).not.toBeInTheDocument()
  })

  it('nivel 2 sobre SU PROPIA tarjeta: la ficha se abre completa', async () => {
    // MOCK_EMPLOYEE (u-2) es el propio usuario logueado en este caso
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
    expect(screen.getByText('Nivel de acceso')).toBeInTheDocument()
  })

  it('admin/nivel ≥3: el comportamiento actual de drill-down completo se mantiene', async () => {
    // renderFicha usa por defecto admin: true — ya cubierto en el describe de arriba,
    // esta prueba deja explícito que no hay regresión con el nuevo gate.
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
    expect(screen.getByText('Nivel de acceso')).toBeInTheDocument()
  })

  it('en vista Lista, la fila de otro miembro también queda deshabilitada para nivel 2', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    await userEvent.click(screen.getAllByRole('button', { name: 'Lista' })[0])
    expect(screen.getByTitle('María González')).toBeDisabled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. LineFichaModal — toggle Lista/Tarjetas
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — toggle Lista/Tarjetas', () => {
  it('la vista por defecto es Tarjetas en Miembros y Clientes', async () => {
    await renderFicha()
    // Dos toggles (Miembros y Clientes), ambos con "Tarjetas" activo
    expect(screen.getAllByRole('button', { name: 'Tarjetas', pressed: true })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Lista', pressed: true })).not.toBeInTheDocument()
  })

  it('cambiar Miembros a Lista mantiene el drill-down funcionando', async () => {
    await renderFicha()
    await userEvent.click(screen.getAllByRole('button', { name: 'Lista' })[0])
    expect(screen.getAllByRole('button', { name: 'Lista', pressed: true })).toHaveLength(1)
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. LineFichaModal — resumen de finanzas del último período
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — resumen de finanzas del último período', () => {
  it('usuario privilegiado ve los KPIs del mes actual fijo', async () => {
    await renderFicha()
    expect(
      screen.getByText(`Finanzas · ${MONTHS_ES[CURRENT_MONTH - 1]} ${CURRENT_YEAR}`),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresos brutos')).toBeInTheDocument()
    expect(screen.getByText('Total egresos')).toBeInTheDocument()
    expect(screen.getByText('Diferencia')).toBeInTheDocument()
    // Montos del mes actual (único reporte válido de l-1 en ese mes) con calcFinanzas real
    expect(screen.getByText('$1000')).toBeInTheDocument()
    expect(screen.getByText('$400')).toBeInTheDocument()
    expect(screen.getByText('$600')).toBeInTheDocument()
    // Ni el mes anterior de la misma línea ni los reportes de otra línea
    expect(screen.queryByText('$500')).not.toBeInTheDocument()
    expect(screen.queryByText('$9999')).not.toBeInTheDocument()
  })

  it('usuario no privilegiado: no pide reportes y no ve el bloque', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    await renderFicha()
    expect(mockLoadYearReports).not.toHaveBeenCalled()
    expect(screen.queryByText('Ingresos brutos')).not.toBeInTheDocument()
    expect(screen.queryByText(/Finanzas/)).not.toBeInTheDocument()
  })

  it('privilegiado sin reportes del mes actual: muestra "Sin datos financieros"', async () => {
    mockLoadYearReports.mockResolvedValueOnce({ data: [], error: null })
    await renderFicha()
    expect(
      screen.getByText(
        `Aún no hay datos financieros para ${MONTHS_ES[CURRENT_MONTH - 1]} ${CURRENT_YEAR}.`,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ingresos brutos')).not.toBeInTheDocument()
  })

  it('el resumen no aparece dentro del drill-down', async () => {
    await renderFicha()
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    expect(screen.queryByText('Ingresos brutos')).not.toBeInTheDocument()
  })

  it('no cae al mes anterior aunque tenga datos válidos (bug: todas las líneas deben compararse en el mismo mes)', async () => {
    mockLoadYearReports.mockResolvedValueOnce({
      data: [
        {
          id: 'r-actual',
          line_id: 'l-1',
          year: CURRENT_YEAR,
          month: CURRENT_MONTH,
          data: {
            finanzas: {
              ingresos: [{ id: 'x', descripcion: 'Real', monto: 9999 }],
              gastosOperativos: [],
              sueldos: [],
              otrosGastos: [],
            },
          },
        },
        {
          id: 'r-prev',
          line_id: 'l-1',
          year: PREV_YEAR,
          month: PREV_MONTH,
          data: {
            finanzas: {
              ingresos: [{ id: 'i-1', descripcion: 'Anterior', monto: 1000 }],
              gastosOperativos: [{ id: 'g-1', descripcion: 'x', monto: 123 }],
              sueldos: [],
              otrosGastos: [],
            },
          },
        },
      ],
      error: null,
    })
    await renderFicha()
    // Debe mostrar el mes actual, no el mes anterior
    expect(
      screen.getByText(`Finanzas · ${MONTHS_ES[CURRENT_MONTH - 1]} ${CURRENT_YEAR}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(`Finanzas · ${MONTHS_ES[PREV_MONTH - 1]} ${PREV_YEAR}`),
    ).not.toBeInTheDocument()
    // Los KPIs del mes anterior ($1000) no deben aparecer
    expect(screen.queryByText('$1000')).not.toBeInTheDocument()
    expect(screen.getAllByText('$9999').length).toBeGreaterThan(0)
  })

  it('mes actual marcado como incompleto: no cae a otro mes, muestra "Sin datos financieros"', async () => {
    mockLoadYearReports.mockResolvedValueOnce({
      data: [
        {
          id: 'r-incomp',
          line_id: 'l-1',
          year: CURRENT_YEAR,
          month: CURRENT_MONTH,
          data: {
            incompleto: true,
            finanzas: {
              ingresos: [{ id: 'y', descripcion: 'Incompleto', monto: 5000 }],
              gastosOperativos: [],
              sueldos: [],
              otrosGastos: [],
            },
          },
        },
        {
          id: 'r-prev',
          line_id: 'l-1',
          year: PREV_YEAR,
          month: PREV_MONTH,
          data: {
            finanzas: {
              ingresos: [{ id: 'z', descripcion: 'Previo', monto: 2500 }],
              gastosOperativos: [{ id: 'g-2', descripcion: 'x', monto: 300 }],
              sueldos: [],
              otrosGastos: [],
            },
          },
        },
      ],
      error: null,
    })
    await renderFicha()
    expect(
      screen.getByText(
        `Aún no hay datos financieros para ${MONTHS_ES[CURRENT_MONTH - 1]} ${CURRENT_YEAR}.`,
      ),
    ).toBeInTheDocument()
    // Ni el valor del mes incompleto ni el del mes anterior deben aparecer
    expect(screen.queryByText('$5000')).not.toBeInTheDocument()
    expect(screen.queryByText('$2500')).not.toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. LineFichaModal — navegación a Finanzas del team
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — navegación a la sección de Finanzas', () => {
  it('click en "Ingresos brutos" cierra el modal y navega con section=ingresos', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ir a ingresos'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location').textContent).toBe(
      '/reportes/linea/l-1?tab=finanzas&section=ingresos',
    )
  })

  it('click en "Total egresos" navega con section=gastos', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByTitle('Ir a gastos'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location').textContent).toBe(
      '/reportes/linea/l-1?tab=finanzas&section=gastos',
    )
  })

  it('sin can("reportes"): los KPIs se ven pero no son navegables', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: true },
      can: (k) => k !== 'reportes',
      signOut: vi.fn(),
    })
    await renderFicha()
    expect(screen.getByText('Ingresos brutos')).toBeInTheDocument()
    expect(screen.getByText('$1000')).toBeInTheDocument()
    expect(screen.queryByTitle('Ir a ingresos')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Ir a gastos')).not.toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. LineFichaModal — botón "Ver reporte de la línea" → tab Resumen
// ══════════════════════════════════════════════════════════════════════════════

describe('LineFichaModal — botón Ver reporte → tab Resumen', () => {
  it('con can("reportes") aparece el botón "Ver reporte de la línea"', async () => {
    // renderFicha usa admin: true, can: () => true → incluye 'reportes'
    await renderFicha()
    expect(screen.getByRole('button', { name: /Ver reporte de la línea/i })).toBeInTheDocument()
  })

  it('click en el botón cierra el modal y navega a ?tab=hub', async () => {
    const onClose = await renderFicha()
    await userEvent.click(screen.getByRole('button', { name: /Ver reporte de la línea/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location').textContent).toBe('/reportes/linea/l-1?tab=hub')
  })

  it('sin can("reportes") el botón NO aparece', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: true },
      can: (k) => k !== 'reportes',
      signOut: vi.fn(),
    })
    await renderFicha()
    expect(
      screen.queryByRole('button', { name: /Ver reporte de la línea/i }),
    ).not.toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. LinesView — círculo de salud clickeable → tab Resumen
// ══════════════════════════════════════════════════════════════════════════════

describe('LinesView — círculo de salud navega al reporte sin abrir la ficha', () => {
  function renderLinesWithSpy() {
    wrap(
      <>
        <LinesView companyId="co-1" canManage={true} />
        <LocationSpy />
      </>,
    )
  }

  it('click en el dial de salud navega a ?tab=hub y NO abre la ficha', async () => {
    renderLinesWithSpy()
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())

    const dialBtn = screen.getByRole('button', { name: 'Ver reporte de Georgina' })
    await userEvent.click(dialBtn)

    expect(screen.getByTestId('location').textContent).toBe('/reportes/linea/l-1?tab=hub')
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
  })

  it('sin can("reportes") el dial NO es un botón (no interactivo)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: true },
      can: (k) => k !== 'reportes',
      signOut: vi.fn(),
    })
    renderLinesWithSpy()
    await waitFor(() => expect(screen.getByText('Georgina')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: 'Ver reporte de Georgina' }),
    ).not.toBeInTheDocument()
  })
})
