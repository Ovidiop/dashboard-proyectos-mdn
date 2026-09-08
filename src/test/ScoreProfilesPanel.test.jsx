import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../supabase'
import ScoreProfilesPanel from '../components/empresa/ScoreProfilesPanel'

const DEFAULT_PROFILE = {
  id: 'p-default',
  name: 'Default',
  is_default: true,
  match: {},
  weights: {
    entregas: 25,
    puntualidad: 20,
    arrastre: 10,
    tareas_fijas: 15,
    piezas_av: 10,
    reuniones: 5,
    campanas: 5,
    chequeo: 5,
    tickets: 0,
  },
}
const IT_PROFILE = {
  id: 'p-it',
  name: 'IT',
  is_default: false,
  match: { department_ids: [0] },
  weights: {
    entregas: 25,
    puntualidad: 20,
    arrastre: 10,
    tareas_fijas: 0,
    piezas_av: 0,
    reuniones: 5,
    campanas: 0,
    chequeo: 0,
    tickets: 40,
  },
}

const USERS = [
  {
    user_id: 'u1',
    first_name: 'Ana',
    last_name: 'Pérez',
    department_id: 1,
    position_id: null,
    access_level: 1,
  },
  {
    user_id: 'u2',
    first_name: 'Luis',
    last_name: 'Gómez',
    department_id: 0,
    position_id: null,
    access_level: 1,
  },
]
const DEPARTMENTS = [
  { department_id: 0, department_name: 'IT' },
  { department_id: 1, department_name: 'Redes' },
]

function mockTables({ updateSpy } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'employee_score_profiles') {
      const q = makeQuery([DEFAULT_PROFILE, IT_PROFILE])
      if (updateSpy) {
        q.update = vi.fn((payload) => {
          updateSpy(payload)
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
        })
      }
      return q
    }
    if (table === 'users') return makeQuery(USERS)
    if (table === 'departments') return makeQuery(DEPARTMENTS)
    if (table === 'positions') return makeQuery([])
    return makeQuery([])
  })
}

describe('ScoreProfilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista los perfiles con sus pesos y cuenta a los empleados que matchean', async () => {
    mockTables()
    render(<ScoreProfilesPanel companyId="co-1" userId="admin-1" />)

    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument())
    expect(screen.getByText('IT')).toBeInTheDocument()
    // u1 (dept 1) → Default; u2 (dept 0) → IT — un empleado matchea cada perfil.
    expect(screen.getAllByText('1 empleado')).toHaveLength(2)
  })

  it('muestra a qué departamento matchea un perfil no-default', async () => {
    mockTables()
    render(<ScoreProfilesPanel companyId="co-1" userId="admin-1" />)
    await waitFor(() => expect(screen.getByText(/Departamento: IT/)).toBeInTheDocument())
  })

  it('editar un peso muestra el botón de guardar y lo envía al guardar', async () => {
    const updateSpy = vi.fn()
    mockTables({ updateSpy })
    render(<ScoreProfilesPanel companyId="co-1" userId="admin-1" />)
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument())

    const inputs = screen.getAllByDisplayValue('25') // "entregas" del perfil Default y del IT
    await userEvent.clear(inputs[0])
    await userEvent.type(inputs[0], '30')

    expect(screen.getByText('Guardar cambios')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Guardar cambios'))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.weights.entregas).toBe(30)
    expect(payload.updated_by).toBe('admin-1')
  })

  it('descartar restaura el peso original sin guardar', async () => {
    mockTables()
    render(<ScoreProfilesPanel companyId="co-1" userId="admin-1" />)
    await waitFor(() => expect(screen.getByText('Default')).toBeInTheDocument())

    const inputs = screen.getAllByDisplayValue('25')
    await userEvent.clear(inputs[0])
    await userEvent.type(inputs[0], '99')
    expect(screen.getByText('Descartar')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Descartar'))
    expect(screen.queryByText('Guardar cambios')).not.toBeInTheDocument()
  })

  it('muestra el error si falla la carga', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'employee_score_profiles') return makeQuery([], { error: { message: 'boom' } })
      return makeQuery([])
    })
    render(<ScoreProfilesPanel companyId="co-1" userId="admin-1" />)
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
  })
})
