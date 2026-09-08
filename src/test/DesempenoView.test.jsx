import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../hooks/useEmployeeScores', () => ({
  useEmployeeScores: vi.fn(),
}))

import { useEmployeeScores } from '../hooks/useEmployeeScores'
import DesempenoView from '../components/evaluaciones/DesempenoView'

const USERS = [
  { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez', avatar_url: null },
  { user_id: 'u2', first_name: 'Luis', last_name: 'Gómez', avatar_url: null },
]

function result(overrides = {}) {
  return {
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
    ],
    disponibilidad: 1,
    autoCirculoPct: null,
    enRanking: true,
    ...overrides,
  }
}

function mockHook(overrides = {}) {
  useEmployeeScores.mockReturnValue({
    loading: false,
    error: null,
    scores: new Map([
      ['u1', result({ score: 90 })],
      ['u2', result({ score: 60, estado: 'parcial' })],
    ]),
    users: USERS,
    isSnapshot: false,
    ranking: [],
    isCurrentMonth: true,
    ...overrides,
  })
}

describe('DesempenoView', () => {
  it('lista a los empleados con score, ordenados de mayor a menor', () => {
    mockHook()
    render(<DesempenoView />)
    const names = screen.getAllByText(/Ana Pérez|Luis Gómez/).map((el) => el.textContent)
    expect(names[0]).toBe('Ana Pérez')
    expect(names[1]).toBe('Luis Gómez')
  })

  it('muestra el badge de mes parcial', () => {
    mockHook()
    render(<DesempenoView />)
    expect(screen.getByText('Parcial')).toBeInTheDocument()
  })

  it('expande el desglose al hacer clic en un empleado', async () => {
    mockHook()
    render(<DesempenoView />)
    expect(screen.queryByText('Cumplimiento de entregas')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Ana Pérez'))
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
  })

  it('sin empleados con datos suficientes muestra el mensaje vacío', () => {
    mockHook({ scores: new Map(), users: USERS })
    render(<DesempenoView />)
    expect(screen.getByText(/No hay empleados con datos suficientes/)).toBeInTheDocument()
  })

  it('muestra el error si la carga falla', () => {
    mockHook({ loading: false, error: 'boom', scores: new Map() })
    render(<DesempenoView />)
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
