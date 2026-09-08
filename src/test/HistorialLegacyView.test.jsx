import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const SESSIONS = [
  {
    total_score: 4.5,
    employee: {
      user_id: 'u1',
      first_name: 'María',
      last_name: 'González',
      email: 'maria@test.com',
      position: { position_name: 'Diseñadora' },
    },
    manager: null,
  },
]

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { evaluation_sessions: () => makeQuery(SESSIONS) },
  }),
}))

import HistorialLegacyView from '../components/evaluaciones/HistorialLegacyView'

function renderView() {
  return render(
    <MemoryRouter>
      <HistorialLegacyView companyId="co-1" />
    </MemoryRouter>,
  )
}

describe('HistorialLegacyView', () => {
  it('muestra las evaluaciones del período con su score', async () => {
    renderView()
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    expect(screen.getByText('4.5')).toBeInTheDocument()
  })

  it('no ofrece crear ni editar — solo lectura', async () => {
    renderView()
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Evaluar/i })).not.toBeInTheDocument()
  })

  it('al hacer click en el nombre navega al perfil del empleado', async () => {
    renderView()
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('María González'))
    expect(navigateMock).toHaveBeenCalledWith('/evaluaciones/empleado/u1')
  })
})
