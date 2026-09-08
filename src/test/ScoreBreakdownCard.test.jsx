import { render, screen } from '@testing-library/react'
import ScoreBreakdownCard from '../components/evaluaciones/ScoreBreakdownCard'

function result(overrides = {}) {
  return {
    score: 87,
    estado: 'ok',
    breakdown: [],
    disponibilidad: 1,
    autoCirculoPct: null,
    ...overrides,
  }
}

const CRITERIA = [{ id: 'c1', icon: '⭐', name: 'Calidad', description: 'Qué tan bien lo hace' }]

function rating(overrides = {}) {
  return {
    items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 4.6 }],
    comment: 'Buen mes',
    rated_at: '2026-08-30T00:00:00Z',
    ...overrides,
  }
}

describe('ScoreBreakdownCard', () => {
  it('sin criterios del jefe: la nota es el score automático convertido a /5', () => {
    render(<ScoreBreakdownCard result={result({ score: 87 })} />)
    // 87/100 → 4.35/5 (4.3 por redondeo binario de punto flotante, no 4.4)
    expect(screen.getByText('4.3')).toBeInTheDocument()
    expect(screen.getByText('sobre 5')).toBeInTheDocument()
    expect(screen.queryByText(/Lo evalúa el jefe/)).not.toBeInTheDocument()
  })

  it('un cargo sin criterios no muestra el bloque del jefe aunque haya score', () => {
    render(<ScoreBreakdownCard result={result()} criteria={[]} />)
    expect(screen.queryByText(/Lo evalúa el jefe/)).not.toBeInTheDocument()
  })

  it('combina 70/30 cuando hay score automático y evaluación del jefe', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: 87 })}
        criteria={CRITERIA}
        managerRating={rating()}
      />,
    )
    // auto 4.35/5 (70%) + jefe 4.6/5 (30%) = 4.42/5
    expect(screen.getByText('4.4')).toBeInTheDocument()
    // "4.6" aparece también en la casilla del criterio
    expect(screen.getAllByText('4.6').length).toBeGreaterThanOrEqual(1)
  })

  it('cargo sin indicadores automáticos usa solo la evaluación del jefe como nota', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: null, estado: 'sin_datos' })}
        criteria={CRITERIA}
        managerRating={rating()}
      />,
    )
    // "4.6" aparece tanto en la nota general como en la casilla del criterio.
    expect(screen.getAllByText('4.6').length).toBeGreaterThanOrEqual(2)
  })

  it('sin evaluación del jefe todavía muestra el aviso de pendiente', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: 87 })}
        criteria={CRITERIA}
        managerRating={null}
      />,
    )
    expect(screen.getByText('Pendiente de evaluación este mes.')).toBeInTheDocument()
  })

  it('muestra el botón Evaluar solo si canEvaluar es true', () => {
    const { rerender } = render(
      <ScoreBreakdownCard
        result={result()}
        criteria={CRITERIA}
        managerRating={null}
        canEvaluar={false}
      />,
    )
    expect(screen.queryByText('Evaluar')).not.toBeInTheDocument()

    rerender(
      <ScoreBreakdownCard
        result={result()}
        criteria={CRITERIA}
        managerRating={null}
        canEvaluar={true}
      />,
    )
    expect(screen.getByText('Evaluar')).toBeInTheDocument()
  })

  it('renderiza las casillas de la evaluación del jefe', () => {
    render(<ScoreBreakdownCard result={result()} criteria={CRITERIA} managerRating={rating()} />)
    expect(screen.getByText('Calidad')).toBeInTheDocument()
    expect(screen.getByText((text) => text.includes('Buen mes'))).toBeInTheDocument()
  })

  it('oculta los indicadores que no aplican al cargo (peso 0) pero muestra los que aplican sin datos', () => {
    render(
      <ScoreBreakdownCard
        result={result({
          breakdown: [
            {
              key: 'entregas',
              label: 'Cumplimiento de entregas',
              aplica: false,
              pct: null,
              pesoBase: 25,
              pesoEfectivo: 0,
              unidades: 0,
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
        })}
      />,
    )
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
    expect(screen.queryByText('Tickets IT en SLA')).not.toBeInTheDocument()
  })

  it('muestra el estado y color según el estado del resultado', () => {
    render(<ScoreBreakdownCard result={result({ estado: 'parcial' })} />)
    expect(screen.getByText('Medición parcial')).toBeInTheDocument()
  })

  it('muestra el nombre del empleado y el cargo', () => {
    render(
      <ScoreBreakdownCard result={result()} employeeName="Ana Pérez" cargoLabel="Diseñadora" />,
    )
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
  })
})
