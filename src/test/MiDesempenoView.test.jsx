import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

vi.mock('../hooks/useEmployeeScores', () => ({
  useEmployeeScores: vi.fn(),
}))

// El panel operativo (tareas/proyectos/tareas fijas, portado de Mi Perfil v2 en
// F6) hace su propia carga de supabase — sin companyId no dispara ninguna query,
// así que estos tests (centrados en el score) no necesitan datos aquí.
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({}),
}))

import { useEmployeeScores } from '../hooks/useEmployeeScores'
import MiDesempenoView from '../components/evaluaciones/MiDesempenoView'

function renderView(props) {
  return render(
    <MemoryRouter>
      <MiDesempenoView userId="u1" {...props} />
    </MemoryRouter>,
  )
}

const OK_RESULT = {
  score: 87.5,
  estado: 'ok',
  breakdown: [
    {
      key: 'entregas',
      label: 'Cumplimiento de entregas',
      aplica: true,
      pct: 0.9,
      pesoBase: 25,
      pesoEfectivo: 25,
      unidades: 10,
    },
    {
      key: 'tickets',
      label: 'Tickets IT en SLA',
      aplica: false,
      pct: null,
      pesoBase: 0,
      pesoEfectivo: 0,
      unidades: 0,
    },
  ],
  disponibilidad: 1,
  autoCirculoPct: null,
  enRanking: true,
}

function mockHook(overrides = {}) {
  useEmployeeScores.mockReturnValue({
    loading: false,
    error: null,
    scores: new Map([['u1', OK_RESULT]]),
    users: [],
    isSnapshot: false,
    ranking: [],
    isCurrentMonth: true,
    ...overrides,
  })
}

describe('MiDesempenoView', () => {
  it('muestra el score y el desglose del empleado', () => {
    mockHook()
    renderView()
    expect(screen.getByText('87.5')).toBeInTheDocument()
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
  })

  it('muestra un indicador que no aplica sin tratarlo como 0%', () => {
    mockHook()
    renderView()
    expect(screen.getByText('No aplica a tu cargo')).toBeInTheDocument()
  })

  it('sin datos suficientes: no muestra un número engañoso', () => {
    mockHook({
      scores: new Map([
        [
          'u1',
          {
            score: null,
            estado: 'sin_datos',
            breakdown: [],
            disponibilidad: 1,
            autoCirculoPct: null,
            enRanking: false,
          },
        ],
      ]),
    })
    renderView()
    expect(screen.getByText(/Sin datos suficientes este mes/)).toBeInTheDocument()
  })

  it('muestra el spinner de carga', () => {
    mockHook({ loading: true, scores: new Map() })
    const { container } = renderView()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('muestra el error si la carga falla', () => {
    mockHook({ loading: false, error: 'boom', scores: new Map() })
    renderView()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })

  it('indica cuando el mes está cerrado y congelado', () => {
    mockHook({ isSnapshot: true })
    renderView()
    expect(screen.getByText(/Mes cerrado/)).toBeInTheDocument()
  })
})
