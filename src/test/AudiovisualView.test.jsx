import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const TODAY = new Date()
const dateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DAY_10 = dateStr(new Date(TODAY.getFullYear(), TODAY.getMonth(), 10))

const MOCK_PAUTAS = [
  {
    id: 'p1',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Georgina',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: 'https://drive.google.com/x',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'solicitada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p2',
    company_id: 'co-1',
    client_id: 'c2',
    client_name: 'Cliente Sabrina',
    line_id: 'line-2',
    tema: '',
    place: '',
    pauta_date: null,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: 'https://drive.google.com/y',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'solicitada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p3',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Agendada',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: DAY_10,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: '',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'programada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
  {
    id: 'p4',
    company_id: 'co-1',
    client_id: 'c1',
    client_name: 'Cliente Realizada',
    line_id: 'line-1',
    tema: '',
    place: '',
    pauta_date: DAY_10,
    salida: null,
    llegada: null,
    formats: [],
    graba_user_id: null,
    graba_other: null,
    edita_user_id: null,
    edita_other: null,
    attendee_ids: [],
    link: '',
    grilla_delivered_at: null,
    piezas_desc: '',
    status: 'realizada',
    submitted: true,
    piezas_totales: 0,
    piezas_editadas: 0,
  },
]

const MOCK_USERS = [
  {
    user_id: 'coord-1',
    first_name: 'Lizdania',
    last_name: 'Pérez',
    avatar_url: null,
    deleted_at: null,
    department_id: 2,
    access_level: 2,
  },
  {
    user_id: 'jefa-1',
    first_name: 'Georgina',
    last_name: '',
    avatar_url: null,
    deleted_at: null,
    department_id: 1,
  },
]

const MOCK_CLIENTS = [
  { id: 'c1', name: 'Cliente Georgina', line_id: 'line-1' },
  { id: 'c2', name: 'Cliente Sabrina', line_id: 'line-2' },
]

const LINES = [
  { id: 'line-1', name: 'Georgina' },
  { id: 'line-2', name: 'Sabrina' },
]

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      av_pautas: () => makeQuery(MOCK_PAUTAS),
      users: () => makeQuery(MOCK_USERS),
    },
  }),
}))

import AudiovisualView from '../components/pautas/AudiovisualView'

function renderView({ userProfile, can, lines = LINES, initialEntries = ['/tareas/pautas'] }) {
  return render(
    <AudiovisualView
      companyId="co-1"
      userProfile={userProfile}
      can={can}
      lines={lines}
      clients={MOCK_CLIENTS}
    />,
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      ),
    },
  )
}

describe('AudiovisualView', () => {
  it('jefa de línea (audiovisual.manage): ve solo su línea fija, sin selector "Ver"', async () => {
    renderView({
      userProfile: { user_id: 'jefa-1', company_id: 'co-1', access_level: 3, admin: false },
      can: (key) => key === 'audiovisual.manage',
      lines: [LINES[0]],
    })
    await waitFor(() => {
      expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText('Cliente Sabrina')).not.toBeInTheDocument()
    expect(screen.queryByText('Ver')).not.toBeInTheDocument()
    expect(screen.getByText('+ Solicitar pauta')).toBeInTheDocument()
  })

  it('coordinadora audiovisual SIN audiovisual.ver_todo: ya no ve el selector "Ver" (coordinar no implica ver todas las líneas), pero puede agendar/declinar', async () => {
    renderView({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
        department_id: 2,
      },
      can: (key) => key === 'audiovisual.coordina',
      lines: [],
    })
    // El coordinador ahora edita el brief inline (fix: pauta creada por él ya no queda en
    // blanco), así que el cliente se rinde como <select> (valor seleccionado vía
    // getByDisplayValue) en vez de texto plano — cada fila lista todos los clientes como
    // <option>, por lo que getByText('Cliente Georgina') matchearía más de un elemento.
    // Sin línea propia asignada (lines: []) sigue viendo todo (pautasInScope con scope
    // null no filtra) — lo que cambió es que ya no ve el selector "Ver" de todas modos,
    // porque "audiovisual.coordina" dejó de implicar canViewAll.
    await waitFor(() => {
      expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Cliente Sabrina')).toBeInTheDocument()
    expect(screen.queryByText('Ver')).not.toBeInTheDocument()
    expect(screen.getByText('Sin línea')).toBeInTheDocument()
    expect(screen.getAllByText('Agendar').length).toBe(2)
    expect(screen.getAllByText('Declinar').length).toBe(2)
    expect(screen.getByText('+ Agregar pauta')).toBeInTheDocument()
  })

  it('coordinador CON línea propia asignada y SIN ver_todo solo ve pautas de su línea', async () => {
    renderView({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
        department_id: 2,
      },
      can: (key) => key === 'audiovisual.coordina',
      lines: [LINES[0]], // tiene línea propia asignada (Georgina) — antes veía igual todas
    })
    await waitFor(() => {
      expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText('Cliente Sabrina')).not.toBeInTheDocument()
    expect(screen.queryByText('Ver')).not.toBeInTheDocument()
  })

  it('con audiovisual.ver_todo (aunque no coordine) ve los badges "Todos" + cada línea, y todas las pautas', async () => {
    renderView({
      userProfile: { user_id: 'lizdania-1', company_id: 'co-1', access_level: 1, admin: false },
      can: (key) => key === 'audiovisual.ver_todo',
      lines: [],
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    })
    // `lines: []` en este test (sin membresía en ninguna línea) — no hay badges de línea
    // que mostrar, pero como tiene audiovisual.ver_todo sigue viendo todas las pautas.
    expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    expect(screen.getByText('Cliente Sabrina')).toBeInTheDocument()
  })

  it('dirección: filtrar por el badge de una línea oculta las pautas de las otras líneas', async () => {
    renderView({
      userProfile: { user_id: 'dir-1', company_id: 'co-1', access_level: 4, admin: false },
      can: () => true,
    })
    // Dirección también coordina (can:()=>true), así que el brief se rinde como <select>
    // (ver nota en el test anterior) — se usa getByDisplayValue en vez de getByText.
    await waitFor(() => {
      expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Cliente Sabrina')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Georgina' }))

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Cliente Sabrina')).not.toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()
  })

  it('sin capabilities de audiovisual: la tabla queda en modo lectura, sin botones de acción', async () => {
    renderView({
      userProfile: { user_id: 'u9', company_id: 'co-1', access_level: 1, admin: false },
      can: () => false,
      lines: [LINES[0]],
    })
    await waitFor(() => {
      expect(screen.getByText('Cliente Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText('+ Solicitar pauta')).not.toBeInTheDocument()
    expect(screen.queryByText('+ Agregar pauta')).not.toBeInTheDocument()
    expect(screen.queryByText('Agendar')).not.toBeInTheDocument()
  })

  it('con audiovisual.piezas (sin coordina) puede editar piezas de una pauta realizada, pero no agendar/declinar', async () => {
    renderView({
      userProfile: {
        user_id: 'editor-1',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
        department_id: 2,
      },
      can: (key) => key === 'audiovisual.piezas',
      lines: [],
      // Deeplink directo a la pauta 'realizada' (p4), igual que abrir desde la campanita.
      initialEntries: ['/tareas/pautas?pautaId=p4'],
    })
    await waitFor(() => {
      expect(screen.getByText('Edición de piezas')).toBeInTheDocument()
    })
    // Editable: el picker de editores está disponible dentro de la sección de piezas.
    expect(screen.getByPlaceholderText('Buscar empleado por nombre…')).toBeInTheDocument()
    // Pero no tiene audiovisual.coordina: no ve los botones de agendar/declinar.
    expect(screen.queryByText('Agendar')).not.toBeInTheDocument()
    expect(screen.queryByText('Declinar')).not.toBeInTheDocument()
  })
})

describe('AudiovisualView — SummaryCard (Todas/Agendadas/Realizadas) filtra SOLO el calendario', () => {
  // El pill del calendario tiene `title="<salida> · <client_name>"` (AvCalendar.jsx) — único,
  // a diferencia del texto plano del client_name, que se repite en la fila de AvPhaseTable
  // cuando su pestaña coincide con el status.
  const calendarPill = (name) => screen.getByTitle(new RegExp(name))
  const queryCalendarPill = (name) => screen.queryByTitle(new RegExp(name))
  const summaryCard = (label) => screen.getByRole('button', { name: `Filtrar por ${label}` })

  async function renderCoordinadora() {
    renderView({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
        department_id: 2,
      },
      can: (key) => key === 'audiovisual.coordina',
      lines: [],
    })
    await waitFor(() => {
      expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    })
  }

  it('solo hay 3 recuadros: Todas, Agendadas, Realizadas (sin "Solicitudes pendientes")', async () => {
    await renderCoordinadora()
    expect(summaryCard('Todas')).toBeInTheDocument()
    expect(summaryCard('Agendadas')).toBeInTheDocument()
    expect(summaryCard('Realizadas')).toBeInTheDocument()
    expect(screen.queryByText('Solicitudes pendientes')).not.toBeInTheDocument()
  })

  it('por defecto ("Todas" activo) el calendario muestra agendadas y realizadas juntas', async () => {
    await renderCoordinadora()
    expect(summaryCard('Todas')).toHaveClass('border-[#FFB800]')
    expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()
  })

  it('click en "Agendadas" filtra el calendario a solo programadas, sin tocar la pestaña de la tabla', async () => {
    await renderCoordinadora()
    // Tabla por defecto en Solicitudes — sigue ahí después de filtrar el calendario.
    expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()

    fireEvent.click(summaryCard('Agendadas'))

    await waitFor(() => {
      expect(queryCalendarPill('Cliente Realizada')).not.toBeInTheDocument()
    })
    expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    // La tabla sigue mostrando Solicitudes — el click en el card no cambió la pestaña.
    expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()
  })

  it('click en "Realizadas" filtra el calendario a solo realizadas', async () => {
    await renderCoordinadora()
    fireEvent.click(summaryCard('Realizadas'))

    await waitFor(() => {
      expect(queryCalendarPill('Cliente Agendada')).not.toBeInTheDocument()
    })
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()
  })

  it('"Todas" restablece el calendario sin filtrar', async () => {
    await renderCoordinadora()
    fireEvent.click(summaryCard('Realizadas'))
    await waitFor(() => {
      expect(queryCalendarPill('Cliente Agendada')).not.toBeInTheDocument()
    })

    fireEvent.click(summaryCard('Todas'))
    await waitFor(() => {
      expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    })
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()
  })

  it('cambiar de pestaña en la tabla de seguimiento NO cambia lo que se ve en el calendario', async () => {
    await renderCoordinadora()
    // Calendario muestra ambas por defecto (statusFilter=null).
    expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()

    // Cambiar la pestaña de la tabla directamente (no el SummaryCard).
    fireEvent.click(screen.getByRole('button', { name: /^Agenda [0-9]/ }))

    // El calendario sigue mostrando ambas — no se filtró.
    expect(calendarPill('Cliente Agendada')).toBeInTheDocument()
    expect(calendarPill('Cliente Realizada')).toBeInTheDocument()
  })
})

describe('AudiovisualView — la tabla de seguimiento sigue al mes que se ve en el calendario', () => {
  it('al navegar a otro mes, una pauta agendada de este mes deja de verse en la tabla; las solicitudes sin fecha siguen', async () => {
    renderView({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
        department_id: 2,
      },
      can: (key) => key === 'audiovisual.coordina',
      lines: [],
    })
    await waitFor(() => {
      expect(screen.getByTitle(/Cliente Agendada/)).toBeInTheDocument()
    })

    // Ir a la pestaña "Agenda" de la tabla directamente (ya no depende de los SummaryCard).
    fireEvent.click(screen.getByRole('button', { name: /^Agenda [0-9]/ }))
    // Aparece dos veces: el pill del calendario y la fila de la pestaña "Agenda".
    expect(screen.getAllByText('Cliente Agendada').length).toBe(2)

    fireEvent.click(screen.getByLabelText('Mes siguiente'))

    await waitFor(() => {
      expect(screen.queryByText('Cliente Agendada')).not.toBeInTheDocument()
    })

    // Las solicitudes sin fecha confirmada (Cliente Georgina/Sabrina, ambas sin
    // pauta_date) siguen viéndose sin importar el mes que se navegue.
    fireEvent.click(screen.getByRole('button', { name: /^Solicitudes/ }))
    expect(screen.getByDisplayValue('Cliente Georgina')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cliente Sabrina')).toBeInTheDocument()
  })
})

// ── Deep-link ?pautaId= (abierto desde la campanita de notificaciones) ──────────

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc-search">{location.search}</div>
}

function renderWithPautaId(pautaId, { userProfile, can, lines = LINES } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/tareas/pautas?pautaId=${pautaId}`]}>
      <LocationProbe />
      <AudiovisualView
        companyId="co-1"
        userProfile={userProfile}
        can={can}
        lines={lines}
        clients={MOCK_CLIENTS}
      />
    </MemoryRouter>,
  )
}

describe('AudiovisualView — deep-link ?pautaId=', () => {
  const ADMIN_PROFILE = { user_id: 'coord-1', company_id: 'co-1', access_level: 4, admin: true }
  const CAN_ALL = () => true

  it('abre PautaDetailModal con la pauta indicada y limpia el param de la URL', async () => {
    renderWithPautaId('p1', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Cliente Georgina').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByTestId('loc-search').textContent).toBe('')
    })
  })

  it('mueve el mes/pestaña al de una pauta agendada de otro mes', async () => {
    renderWithPautaId('p3', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Cliente Agendada').length).toBeGreaterThan(0)
  })

  it('un pautaId inexistente no rompe la vista y limpia igual el param', async () => {
    renderWithPautaId('no-existe', { userProfile: ADMIN_PROFILE, can: CAN_ALL })
    await waitFor(() => {
      expect(screen.getByTestId('loc-search').textContent).toBe('')
    })
    expect(screen.queryByLabelText('Cerrar')).not.toBeInTheDocument()
  })
})
