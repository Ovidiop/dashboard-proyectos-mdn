import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../hooks/useEmployeeScores', () => ({
  useEmployeeScores: vi.fn(),
}))
vi.mock('../hooks/useManagerRatings', () => ({
  useManagerRatings: vi.fn(),
}))

import { useEmployeeScores } from '../hooks/useEmployeeScores'
import { useManagerRatings } from '../hooks/useManagerRatings'
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

beforeEach(() => {
  useManagerRatings.mockReturnValue({
    loading: false,
    error: null,
    criteriaByPosition: new Map(),
    ratings: new Map(),
    save: vi.fn(),
    reload: vi.fn(),
  })
})

describe('MiDesempenoView', () => {
  it('muestra el score y el desglose del empleado', () => {
    mockHook()
    renderView()
    // score 87.5/100 → 4.4/5 (sin criterios de jefe, se muestra tal cual)
    expect(screen.getByText('4.4')).toBeInTheDocument()
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
  })

  it('un indicador que no aplica al cargo (peso 0) no se lista', () => {
    mockHook()
    renderView()
    expect(screen.queryByText('Tickets IT en SLA')).not.toBeInTheDocument()
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
    expect(screen.getByText('sin datos')).toBeInTheDocument()
    expect(screen.getByText(/Sin datos automáticos suficientes este mes/)).toBeInTheDocument()
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

  it('ya no muestra el panel operativo (Como responsable / Proyectos)', () => {
    mockHook()
    renderView()
    expect(screen.queryByText(/Como responsable/)).not.toBeInTheDocument()
    expect(screen.queryByText('Proyectos')).not.toBeInTheDocument()
  })
})
