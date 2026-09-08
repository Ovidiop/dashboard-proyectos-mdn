/**
 * Smoke test de PautaDetailModal — modal de detalle que abre al hacer clic en una pauta
 * (calendario o tabla de seguimiento). Cubre: renderiza la info esperada, ya no usa emojis
 * literales como iconos (reemplazados por SVG), cierra al click en la ✕, y — para pautas
 * 'realizada' — muestra el checklist de piezas agrupado por editor, editable solo si
 * `canEditPiezas`.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PautaDetailModal from '../components/pautas/PautaDetailModal'

const mockCreatePiezas = vi.fn().mockResolvedValue({ data: [], error: null })
const mockUpdatePieza = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../components/pautas/avPautasApi', () => ({
  createPiezas: (...a) => mockCreatePiezas(...a),
  updatePieza: (...a) => mockUpdatePieza(...a),
  deletePiezas: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

const EMOJIS = ['⏩', '📅', '⏱️', '📍', '👥', '🎬']

const USERS_BY_ID = new Map([
  ['u1', { user_id: 'u1', first_name: 'Lizdania', last_name: 'Andrade' }],
  ['u2', { user_id: 'u2', first_name: 'Georgina', last_name: 'Ríos' }],
])

const AUDIOVISUAL_USERS = [...USERS_BY_ID.values()]

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_name: 'Cliente A',
    tema: 'Spot institucional',
    status: 'programada',
    pauta_date: '2026-08-20',
    salida: '09:00:00',
    llegada: '11:00:00',
    place: 'Estudio central',
    formats: ['V'],
    recurso_ids: ['u1'],
    attendee_ids: ['u2'],
    link: null,
    piezas_desc: null,
    piezas_totales: 0,
    ...overrides,
  }
}

function baseProps(overrides = {}) {
  return {
    pauta: pauta(),
    usersById: USERS_BY_ID,
    audiovisualUsers: AUDIOVISUAL_USERS,
    piezas: [],
    canEditPiezas: true,
    companyId: 'c1',
    onFields: vi.fn(),
    onPiezaChanged: vi.fn(),
    onPiezaDeleted: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('PautaDetailModal', () => {
  it('renderiza la info principal de la pauta', () => {
    render(<PautaDetailModal {...baseProps()} />)
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText(/Estudio central/)).toBeInTheDocument()
    expect(screen.getByText(/Asiste: Georgina Ríos/)).toBeInTheDocument()
    expect(screen.getByText(/LIZDANIA ANDRADE/)).toBeInTheDocument()
  })

  it('ya no usa emojis literales como iconos (reemplazados por SVG)', () => {
    const { container } = render(<PautaDetailModal {...baseProps()} />)
    const text = container.textContent
    EMOJIS.forEach((emoji) => expect(text).not.toContain(emoji))
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6)
  })

  it('null pauta no renderiza nada', () => {
    const { container } = render(<PautaDetailModal {...baseProps({ pauta: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('click en la ✕ cierra el modal', () => {
    const onClose = vi.fn()
    render(<PautaDetailModal {...baseProps({ onClose })} />)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('pauta no realizada no muestra la sección de edición de piezas', () => {
    render(<PautaDetailModal {...baseProps()} />)
    expect(screen.queryByText('Edición de piezas')).not.toBeInTheDocument()
  })

  it('pauta realizada muestra el checklist agrupado por editor', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'listo',
        position: 0,
      },
      {
        id: 'pz2',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #2',
        status: 'pendiente',
        position: 1,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 2 }), piezas })}
      />,
    )
    expect(screen.getByText('Edición de piezas')).toBeInTheDocument()
    expect(screen.getAllByText('Lizdania Andrade').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('Video #1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Video #2')).toBeInTheDocument()
    expect(screen.getByText('1/2 listas')).toBeInTheDocument()
  })

  it('avisa cuando la suma repartida entre editores no cuadra con el total', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'pendiente',
        position: 0,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 3 }), piezas })}
      />,
    )
    expect(screen.getByText(/1 de 3 piezas repartidas/)).toBeInTheDocument()
  })

  it('sin canEditPiezas, el checklist es de solo lectura (sin inputs de texto ni AttendeePicker)', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'listo',
        position: 0,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({
          pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
          piezas,
          canEditPiezas: false,
        })}
      />,
    )
    expect(screen.getByText('Video #1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Video #1')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar empleado por nombre…')).not.toBeInTheDocument()
  })

  it('asignar un editor sin piezas previas le crea una pieza de entrada (regresión: antes desaparecía del picker)', async () => {
    mockCreatePiezas.mockResolvedValueOnce({
      data: [
        {
          id: 'pz-new',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'pendiente',
          position: 0,
        },
      ],
      error: null,
    })
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    // La pauta base tiene un único formato marcado ('V'), así que se autoasigna sin
    // pedirlo pieza por pieza.
    expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u1', ['Video #1'], 0, 'V')
  })

  it('si el insert falla (ej. la tabla av_pauta_piezas no existe todavía), muestra el error en vez de fallar en silencio', async () => {
    mockCreatePiezas.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "av_pauta_piezas" does not exist' },
    })
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    expect(await screen.findByText(/No se pudo asignar el editor/)).toBeInTheDocument()
  })

  it('si onFields (piezas totales) devuelve error, lo muestra traducido en vez de fallar en silencio', async () => {
    const onFields = vi.fn().mockResolvedValue({
      error: { code: '42883', message: 'operator does not exist: uuid = text' },
    })
    render(
      <PautaDetailModal
        {...baseProps({
          pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
          piezas: [],
          onFields,
        })}
      />,
    )
    const input = document.querySelector('input[type="number"]')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    expect(onFields).toHaveBeenCalled()
    expect(
      await screen.findByText(
        'No se pudo guardar el cambio. Vuelve a intentarlo; si sigue pasando, avisa a soporte.',
      ),
    ).toBeInTheDocument()
  })

  describe('piezas por formato', () => {
    it('pauta con Reel y Foto marcados: pide "Salieron" de cada uno y ninguno de Video; "Editadas" es solo lectura', () => {
      render(
        <PautaDetailModal
          {...baseProps({ pauta: pauta({ status: 'realizada', formats: ['R', 'F'] }) })}
        />,
      )
      expect(screen.getByText('Reel')).toBeInTheDocument()
      expect(screen.getByText('Foto')).toBeInTheDocument()
      expect(screen.queryByText('Video de marca')).not.toBeInTheDocument()
      // Un input "Salieron" por formato (2); "Editadas" ya no es un input — lo deriva
      // el checklist de piezas por formato.
      expect(document.querySelectorAll('input[type="number"]').length).toBe(2)
    })

    it('escribir en "Salieron" de Foto llama a onFields con el piezas_por_formato correcto', () => {
      const onFields = vi.fn().mockResolvedValue({ error: null })
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['R', 'F'],
              piezas_por_formato: { R: { salieron: 3, editadas: 2 } },
            }),
            onFields,
          })}
        />,
      )
      const salieronInputs = document.querySelectorAll('input[type="number"]')
      // Orden fijo V/R/F: con formats=['R','F'] el primer input es "Salieron" de Reel,
      // el segundo es "Salieron" de Foto.
      fireEvent.blur(salieronInputs[1], { target: { value: '5' } })
      expect(onFields).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), {
        piezas_por_formato: { R: { salieron: 3, editadas: 2 }, F: { salieron: 5, editadas: 0 } },
      })
    })

    it('"Editadas" se muestra de solo lectura, tomada de piezas_por_formato (la deriva el checklist)', () => {
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['F'],
              piezas_por_formato: { F: { salieron: 5, editadas: 3 } },
            }),
          })}
        />,
      )
      expect(screen.getByText('3')).toBeInTheDocument()
      // No hay ningún input para "Editadas": solo el de "Salieron".
      expect(document.querySelectorAll('input[type="number"]').length).toBe(1)
    })

    it('muestra el total ya sincronizado por el trigger de BD, no una suma recalculada en cliente', () => {
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['R', 'F'],
              piezas_por_formato: {
                R: { salieron: 3, editadas: 2 },
                F: { salieron: 5, editadas: 5 },
              },
              piezas_totales: 8,
              piezas_editadas: 7,
            }),
          })}
        />,
      )
      expect(screen.getByText('8/7')).toBeInTheDocument()
    })

    it('pauta sin formatos marcados conserva el input único "Piezas totales" (camino legacy)', () => {
      render(
        <PautaDetailModal
          {...baseProps({ pauta: pauta({ status: 'realizada', formats: [], piezas_totales: 4 }) })}
        />,
      )
      expect(screen.getByText('Piezas totales')).toBeInTheDocument()
      expect(screen.queryByText('Piezas por formato')).not.toBeInTheDocument()
      expect(document.querySelectorAll('input[type="number"]').length).toBe(1)
    })
  })

  describe('checklist de piezas ligado a formato', () => {
    it('con un único formato marcado, la pieza se etiqueta sola sin mostrar selector', () => {
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'V',
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['V'], piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      expect(document.querySelector('select[aria-label="Formato de Video #1"]')).toBeNull()
    })

    it('con varios formatos marcados, elegir el formato de una pieza llama a updatePieza', async () => {
      mockUpdatePieza.mockResolvedValueOnce({
        data: {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'F',
        },
        error: null,
      })
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: null,
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['R', 'F'], piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      const select = screen.getByLabelText('Formato de Video #1')
      fireEvent.change(select, { target: { value: 'F' } })
      expect(mockUpdatePieza).toHaveBeenCalledWith('pz1', { formato: 'F' })
    })

    it('sin canEditPiezas, el formato de la pieza se muestra como texto, no como selector', () => {
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'R',
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['R', 'F'], piezas_totales: 1 }),
            piezas,
            canEditPiezas: false,
          })}
        />,
      )
      expect(screen.queryByLabelText('Formato de Video #1')).not.toBeInTheDocument()
      // "Reel" aparece también en el bloque "Piezas por formato" — basta con confirmar
      // que la etiqueta de la pieza (no un <select>) está presente.
      expect(screen.getAllByText('Reel').length).toBeGreaterThan(0)
    })
  })
})
