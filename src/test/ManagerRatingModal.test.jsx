import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManagerRatingModal from '../components/evaluaciones/ManagerRatingModal'

const EMPLOYEE = { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez', position_id: 6 }

const CRITERIA_SMM = [
  { id: 'c1', icon: '⭐', name: 'Calidad del feed', description: 'Dinámicos y a tiempo' },
  { id: 'c2', icon: '🤝', name: 'Compromiso con el cliente' },
]

const CRITERIA_OTHER = [{ id: 'c9', icon: '🎯', name: 'Otro criterio de otro cargo' }]

describe('ManagerRatingModal', () => {
  it('pinta solo los criterios del cargo recibido, no otros', () => {
    render(
      <ManagerRatingModal
        employee={EMPLOYEE}
        criteria={CRITERIA_SMM}
        onClose={() => {}}
        onSave={() => {}}
      />,
    )
    expect(screen.getByText('Calidad del feed')).toBeInTheDocument()
    expect(screen.getByText('Compromiso con el cliente')).toBeInTheDocument()
    expect(screen.queryByText('Otro criterio de otro cargo')).not.toBeInTheDocument()
  })

  it('exige puntuar todos los criterios antes de guardar', async () => {
    const onSave = vi.fn()
    render(
      <ManagerRatingModal
        employee={EMPLOYEE}
        criteria={CRITERIA_SMM}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    // Solo puntúa el primer criterio
    const fives = screen.getAllByText('5')
    await userEvent.click(fives[0])
    await userEvent.click(screen.getByText('Guardar evaluación'))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Puntúa todos los criterios antes de guardar.')).toBeInTheDocument()
  })

  it('guarda con el payload correcto cuando todos los criterios están puntuados', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    render(
      <ManagerRatingModal
        employee={EMPLOYEE}
        criteria={CRITERIA_SMM}
        onClose={onClose}
        onSave={onSave}
      />,
    )

    const rows = screen.getAllByRole('radiogroup')
    await userEvent.click(within(rows[0]).getByText('5'))
    await userEvent.click(within(rows[1]).getByText('4'))
    await userEvent.type(screen.getByPlaceholderText(/Contexto opcional/), 'Buen mes')
    await userEvent.click(screen.getByText('Guardar evaluación'))

    expect(onSave).toHaveBeenCalledWith({
      positionId: 6,
      criteria: CRITERIA_SMM,
      scoresById: { c1: 5, c2: 4 },
      comment: 'Buen mes',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('precarga los puntajes de una evaluación existente', () => {
    render(
      <ManagerRatingModal
        employee={EMPLOYEE}
        criteria={CRITERIA_SMM}
        existing={{
          items: [
            { criterion_id: 'c1', score: 5 },
            { criterion_id: 'c2', score: 3 },
          ],
          comment: 'Comentario previo',
        }}
        onClose={() => {}}
        onSave={() => {}}
      />,
    )
    expect(screen.getByDisplayValue('Comentario previo')).toBeInTheDocument()
  })
})
