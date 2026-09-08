import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      users: () => makeQuery([]),
      employee_score_snapshots: () => makeQuery([]),
    },
    rpc: { users: [], profiles: [] },
  }),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import EvaluacionesPage from '../pages/EvaluacionesPage'

function renderWithAuth(userProfile, { can = () => true, path = '/evaluaciones' } = {}) {
  useAuth.mockReturnValue({ userProfile, can })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EvaluacionesPage />
    </MemoryRouter>,
  )
}

const PROFILE = {
  user_id: 'eval-1',
  company_id: 'co-1',
  access_level: 2,
  admin: false,
  first_name: 'Evaluador',
  last_name: 'Test',
}

describe('EvaluacionesPage', () => {
  it('muestra el encabezado de la página', () => {
    renderWithAuth(PROFILE)
    expect(screen.getByText('Evaluaciones')).toBeInTheDocument()
  })

  it('muestra los tabs Mi Desempeño, Desempeño e Historial', () => {
    renderWithAuth(PROFILE)
    expect(screen.getByRole('button', { name: 'Mi Desempeño' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desempeño' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Historial' })).toBeInTheDocument()
  })

  it('el tab activo inicial (/evaluaciones) es Desempeño', () => {
    renderWithAuth(PROFILE)
    const tab = screen.getByRole('button', { name: 'Desempeño' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('el tab Mi Desempeño está activo al navegar a /evaluaciones/mi-desempeno', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/mi-desempeno' })
    const tab = screen.getByRole('button', { name: 'Mi Desempeño' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('el tab Historial está activo al navegar a /evaluaciones/historial', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/historial' })
    const tab = screen.getByRole('button', { name: 'Historial' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('solo muestra los tabs habilitados por capability', () => {
    renderWithAuth(PROFILE, { can: (key) => key === 'evaluaciones.mi-desempeno' })
    expect(screen.getByRole('button', { name: 'Mi Desempeño' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desempeño' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Historial' })).not.toBeInTheDocument()
  })

  it('oculta el tab switcher en el perfil de un empleado ajeno', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/empleado/otro-user' })
    expect(screen.queryByRole('button', { name: 'Mi Desempeño' })).not.toBeInTheDocument()
  })

  it('muestra el spinner mientras no hay userProfile', () => {
    const { container } = renderWithAuth(null)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
