import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManagerRatingCard from '../components/evaluaciones/ManagerRatingCard'

const CRITERIA = [{ id: 'c1', icon: '⭐', name: 'Calidad' }]

describe('ManagerRatingCard', () => {
  it('no renderiza nada si el cargo no tiene criterios', () => {
    const { container } = render(<ManagerRatingCard rating={null} criteria={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el estado pendiente sin evaluación', () => {
    render(<ManagerRatingCard rating={null} criteria={CRITERIA} canEvaluar />)
    expect(screen.getByText('Pendiente de evaluación este mes.')).toBeInTheDocument()
    expect(screen.getByText('Evaluar')).toBeInTheDocument()
  })

  it('no muestra el botón sin capability', () => {
    render(<ManagerRatingCard rating={null} criteria={CRITERIA} canEvaluar={false} />)
    expect(screen.queryByText('Evaluar')).not.toBeInTheDocument()
  })

  it('llama a onEvaluar al hacer clic', async () => {
    const onEvaluar = vi.fn()
    render(<ManagerRatingCard rating={null} criteria={CRITERIA} canEvaluar onEvaluar={onEvaluar} />)
    await userEvent.click(screen.getByText('Evaluar'))
    expect(onEvaluar).toHaveBeenCalled()
  })

  it('muestra las casillas y el comentario de una evaluación existente', () => {
    render(
      <ManagerRatingCard
        rating={{
          items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 4.6 }],
          comment: 'Buen mes',
          rated_at: '2026-08-30T00:00:00Z',
        }}
        criteria={CRITERIA}
        canEvaluar
      />,
    )
    expect(screen.getByText('4.6')).toBeInTheDocument()
    expect(screen.getByText('Calidad')).toBeInTheDocument()
    expect(screen.getByText('Editar')).toBeInTheDocument()
  })
})
