import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../hooks/useEmployeeScores', () => ({
  useEmployeeScores: vi.fn(),
}))
vi.mock('../hooks/useManagerRatings', () => ({
  useManagerRatings: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useEmployeeScores } from '../hooks/useEmployeeScores'
import { useManagerRatings } from '../hooks/useManagerRatings'
import { useAuth } from '../context/AuthContext'
import DesempenoView from '../components/evaluaciones/DesempenoView'

const USERS = [
  {
    user_id: 'u1',
    first_name: 'Ana',
    last_name: 'Pérez',
    avatar_url: null,
    position_id: 6,
    position: { position_name: 'Diseñadora' },
  },
  {
    user_id: 'u2',
    first_name: 'Luis',
    last_name: 'Gómez',
    avatar_url: null,
    position_id: 7,
    position: { position_name: 'Community Manager' },
  },
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
    prevScores: new Map(),
    ...overrides,
  })
}

beforeEach(() => {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'jefe', company_id: 'c1' },
    can: () => true,
  })
  useManagerRatings.mockReturnValue({
    loading: false,
    error: null,
    criteriaByPosition: new Map(),
    ratings: new Map(),
    prevRatings: new Map(),
    save: vi.fn(),
    reload: vi.fn(),
  })
})

function rowFor(name) {
  return screen.getByText(name).closest('tr')
}

describe('DesempenoView', () => {
  it('lista a los empleados con score, ordenados de mayor a menor (nota por defecto)', () => {
    mockHook()
    render(<DesempenoView />)
    const names = screen.getAllByText(/Ana Pérez|Luis Gómez/).map((el) => el.textContent)
    expect(names[0]).toBe('Ana Pérez')
    expect(names[1]).toBe('Luis Gómez')
  })

  it('muestra el badge de estado', () => {
    mockHook()
    render(<DesempenoView />)
    expect(screen.getByText('Parcial')).toBeInTheDocument()
    expect(screen.getByText('Al día')).toBeInTheDocument()
  })

  it('la nota de la fila coincide con la que muestra el detalle (mismo /5, sin divergencia)', async () => {
    mockHook()
    render(<DesempenoView />)
    // score 90/100 → 4.5/5, sin criterios de jefe para el cargo. La celda Nota
    // (font-bold) es la que se compara contra el detalle — la de Automático
    // muestra el mismo valor por coincidencia (sin jefe), así que se distingue por clase.
    const notaCell = within(rowFor('Ana Pérez')).getByText('4.5', {
      selector: '.font-bold',
    })
    expect(notaCell).toBeInTheDocument()
    await userEvent.click(screen.getByText('Ana Pérez'))
    // el modal reusa ScoreBreakdownCard con la misma nota
    expect(screen.getAllByText('4.5').length).toBeGreaterThan(1)
  })

  it('abre el modal de detalle al hacer clic en un empleado', async () => {
    mockHook()
    render(<DesempenoView />)
    expect(screen.queryByText('Cumplimiento de entregas')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Ana Pérez'))
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
  })

  it('el modal navega al siguiente/anterior empleado con las flechas', async () => {
    mockHook()
    render(<DesempenoView />)
    await userEvent.click(screen.getByText('Ana Pérez'))
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Empleado siguiente'))
    expect(screen.getByText('2 de 2')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Empleado anterior'))
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
  })

  it('el buscador filtra por nombre y cargo', async () => {
    mockHook()
    render(<DesempenoView />)
    await userEvent.type(screen.getByPlaceholderText(/Buscar por nombre o cargo/), 'Community')
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
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

  it('un empleado sin score pero con evaluación del jefe igual aparece en la lista', () => {
    mockHook({
      scores: new Map([['u2', result({ score: null, estado: 'sin_datos' })]]),
      users: USERS,
    })
    useManagerRatings.mockReturnValue({
      loading: false,
      error: null,
      criteriaByPosition: new Map([[7, [{ id: 'c1', icon: '⭐', name: 'Calidad' }]]]),
      ratings: new Map([
        ['u2', { items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 4 }] }],
      ]),
      prevRatings: new Map(),
      save: vi.fn(),
      reload: vi.fn(),
    })
    render(<DesempenoView />)
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
  })

  it('abre el modal de evaluación al hacer clic en Evaluar', async () => {
    mockHook()
    useManagerRatings.mockReturnValue({
      loading: false,
      error: null,
      criteriaByPosition: new Map([[6, [{ id: 'c1', icon: '⭐', name: 'Calidad' }]]]),
      ratings: new Map(),
      prevRatings: new Map(),
      save: vi.fn(),
      reload: vi.fn(),
    })
    render(<DesempenoView />)
    await userEvent.click(screen.getByText('Evaluar'))
    expect(screen.getByText('Evaluación del mes')).toBeInTheDocument()
  })

  it('el toggle "Sin evaluar" muestra solo cargos con criterios y sin evaluación del mes', async () => {
    mockHook()
    useManagerRatings.mockReturnValue({
      loading: false,
      error: null,
      criteriaByPosition: new Map([[6, [{ id: 'c1', icon: '⭐', name: 'Calidad' }]]]),
      ratings: new Map(),
      prevRatings: new Map(),
      save: vi.fn(),
      reload: vi.fn(),
    })
    render(<DesempenoView />)
    await userEvent.click(screen.getByText('Sin evaluar'))
    // Ana (cargo 6) tiene criterios y no fue evaluada → queda. Luis (cargo 7) no tiene
    // criterios definidos → se excluye del filtro (no hay evaluación posible).
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Luis Gómez')).not.toBeInTheDocument()
  })

  it('muestra la flecha de variación cuando hay score del mes anterior', () => {
    mockHook({ prevScores: new Map([['u1', 80]]) })
    render(<DesempenoView />)
    // 90/100=4.5 actual vs 80/100=4.0 anterior → subió, flecha ▲
    expect(within(rowFor('Ana Pérez')).getByText(/▲/)).toBeInTheDocument()
  })
})
