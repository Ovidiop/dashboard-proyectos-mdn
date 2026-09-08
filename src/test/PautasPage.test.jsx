import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const MOCK_LINES = [
  { id: 'line-1', name: 'Georgina', company_id: 'co-1', is_general: false, members: [] },
  { id: 'line-2', name: 'Sabrina', company_id: 'co-1', is_general: false, members: [] },
]
const MOCK_CLIENTS = []

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      metric_lines: () => makeQuery(MOCK_LINES),
      metric_clients: () => makeQuery(MOCK_CLIENTS),
      av_pautas: () => makeQuery([]),
      av_pauta_piezas: () => makeQuery([]),
      external_resources: () => makeQuery([]),
      users: () => makeQuery([]),
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import PautasPage from '../pages/PautasPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tareas/pautas']}>
      <PautasPage />
    </MemoryRouter>,
  )
}

describe('PautasPage — visibilidad de líneas', () => {
  it('con audiovisual.ver_todo, un coordinador de nivel bajo y sin membresía en ninguna línea ve TODAS las líneas (bug: antes recibía [])', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
      },
      can: (key) => key === 'audiovisual.ver_todo' || key === 'audiovisual.coordina',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('Todos')).toBeInTheDocument()
  })

  it('con audiovisual.piezas, un editor de nivel bajo y sin membresía en ninguna línea ve TODAS las líneas', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'editor-1',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
      },
      can: (key) => key === 'audiovisual.piezas',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('Todos')).toBeInTheDocument()
  })

  it('sin audiovisual.ver_todo, un usuario de nivel bajo y sin membresía no ve badges de línea (comportamiento previo intacto)', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
      },
      can: () => false,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sin línea')).toBeInTheDocument()
    })
    expect(screen.queryByText('Georgina')).not.toBeInTheDocument()
    expect(screen.queryByText('Sabrina')).not.toBeInTheDocument()
  })
})
