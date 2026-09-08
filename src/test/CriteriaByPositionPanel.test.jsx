import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../supabase'
import CriteriaByPositionPanel from '../components/empresa/CriteriaByPositionPanel'

const POSITIONS = [
  { position_id: 6, position_name: 'Social Media Manager' },
  { position_id: 7, position_name: 'Community Manager' },
]

const CRITERIA = [
  {
    id: 'c1',
    position_id: 6,
    sort_order: 0,
    icon: '⭐',
    name: 'Calidad',
    description: null,
    active: true,
  },
]

describe('CriteriaByPositionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista los criterios del cargo seleccionado', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'positions') return makeQuery(POSITIONS)
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA)
      return makeQuery([])
    })

    render(<CriteriaByPositionPanel companyId="c1" userId="u1" />)
    await waitFor(() => expect(screen.getByText('Calidad')).toBeInTheDocument())
  })

  it('cambiar de cargo muestra sus propios criterios (vacío si no tiene)', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'positions') return makeQuery(POSITIONS)
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA)
      return makeQuery([])
    })

    render(<CriteriaByPositionPanel companyId="c1" userId="u1" />)
    await waitFor(() => expect(screen.getByText('Calidad')).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByRole('combobox'), '7')
    expect(screen.getByText('Este cargo no tiene criterios configurados.')).toBeInTheDocument()
  })

  it('agrega un criterio nuevo al cargo seleccionado', async () => {
    const inserted = {
      id: 'c2',
      position_id: 6,
      sort_order: 1,
      icon: '🤝',
      name: 'Compromiso',
      description: null,
      active: true,
    }
    let call = 0
    supabase.from.mockImplementation((table) => {
      if (table === 'positions') return makeQuery(POSITIONS)
      if (table === 'evaluation_criteria') {
        call += 1
        return call === 1 ? makeQuery(CRITERIA) : makeQuery(inserted)
      }
      return makeQuery([])
    })

    render(<CriteriaByPositionPanel companyId="c1" userId="u1" />)
    await waitFor(() => expect(screen.getByText('Calidad')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Nombre del criterio'), 'Compromiso')
    await userEvent.click(screen.getByText('Agregar'))

    await waitFor(() => expect(screen.getByText('Compromiso')).toBeInTheDocument())
  })

  it('desactivar un criterio lo muestra atenuado con botón Activar', async () => {
    const toggled = { ...CRITERIA[0], active: false }
    let call = 0
    supabase.from.mockImplementation((table) => {
      if (table === 'positions') return makeQuery(POSITIONS)
      if (table === 'evaluation_criteria') {
        call += 1
        return call === 1 ? makeQuery(CRITERIA) : makeQuery(toggled)
      }
      return makeQuery([])
    })

    render(<CriteriaByPositionPanel companyId="c1" userId="u1" />)
    await waitFor(() => expect(screen.getByText('Desactivar')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Desactivar'))
    await waitFor(() => expect(screen.getByText('Activar')).toBeInTheDocument())
  })
})
