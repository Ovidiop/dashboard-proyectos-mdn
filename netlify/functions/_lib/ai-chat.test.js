import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const requireAdminMock = vi.fn()
const loadMetricsDatasetMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)
vi.mock('./requireAdmin.js', () => ({ requireAdmin: requireAdminMock }))
vi.mock('./aiChatData.js', () => ({ loadMetricsDataset: loadMetricsDatasetMock }))

const { handler } = await import('../ai-chat.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }
}

function okResponse(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

const CALLER = { user_id: 'u1', admin: true, company_id: 'c1' }

describe('ai-chat.js handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-key'
    requireAdminMock.mockResolvedValue({ caller: CALLER })
    loadMetricsDatasetMock.mockResolvedValue({ lines: [{ id: 'l1', name: 'Alfa' }], reports: [] })
  })

  it('responde 405 fuera de POST', async () => {
    const res = await handler({ httpMethod: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('responde 500 si falta OPENROUTER_API_KEY', async () => {
    delete process.env.OPENROUTER_API_KEY
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(500)
  })

  it('propaga el error de requireAdmin (403)', async () => {
    requireAdminMock.mockResolvedValue({
      error: { statusCode: 403, body: '{"error":"Forbidden"}' },
    })
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('responde 400 con body inválido', async () => {
    const res = await handler({ httpMethod: 'POST', body: '{not json' })
    expect(res.statusCode).toBe(400)
  })

  it('responde 400 sin messages', async () => {
    const res = await handler(makeEvent({}))
    expect(res.statusCode).toBe(400)
  })

  it('responde 400 si un mensaje no tiene texto', async () => {
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: '' }] }))
    expect(res.statusCode).toBe(400)
  })

  it('responde 400 si un mensaje tiene un role inválido', async () => {
    const res = await handler(makeEvent({ messages: [{ role: 'system', text: 'hola' }] }))
    expect(res.statusCode).toBe(400)
  })

  it('responde 400 si hay más de 20 mensajes', async () => {
    const messages = Array.from({ length: 21 }, () => ({ role: 'user', text: 'hola' }))
    const res = await handler(makeEvent({ messages }))
    expect(res.statusCode).toBe(400)
  })

  it('usa el modelo openrouter/free', async () => {
    fetchMock.mockResolvedValue(okResponse({ choices: [{ message: { content: 'Todo bien.' } }] }))
    await handler(makeEvent({ messages: [{ role: 'user', text: '¿Cómo va la empresa?' }] }))
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.model).toBe('openrouter/free')
  })

  it('happy path sin tool calls: devuelve el texto de OpenRouter', async () => {
    fetchMock.mockResolvedValue(okResponse({ choices: [{ message: { content: 'Todo bien.' } }] }))
    const res = await handler(
      makeEvent({ messages: [{ role: 'user', text: '¿Cómo va la empresa?' }] }),
    )
    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.reply).toBe('Todo bien.')
    expect(payload.toolsUsed).toEqual([])
  })

  it('recorta espacios/saltos de línea al inicio o final de la respuesta del modelo', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ choices: [{ message: { content: '  \nTodo bien.\n  ' } }] }),
    )
    const res = await handler(
      makeEvent({ messages: [{ role: 'user', text: '¿Cómo va la empresa?' }] }),
    )
    const payload = JSON.parse(res.body)
    expect(payload.reply).toBe('Todo bien.')
  })

  it('ejecuta una tool y reinyecta el turno del modelo tal cual antes de la respuesta final', async () => {
    const assistantMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'listar_lineas', arguments: '{}' } },
      ],
    }
    fetchMock
      .mockResolvedValueOnce(okResponse({ choices: [{ message: assistantMessage }] }))
      .mockResolvedValueOnce(
        okResponse({ choices: [{ message: { content: 'La única línea es Alfa.' } }] }),
      )

    const res = await handler(makeEvent({ messages: [{ role: 'user', text: '¿Qué líneas hay?' }] }))
    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.reply).toBe('La única línea es Alfa.')
    expect(payload.toolsUsed).toEqual(['listar_lineas'])

    // Segunda llamada a OpenRouter: el penúltimo mensaje es el turno del modelo intacto
    // (con tool_calls), el último trae el resultado de la tool con role "tool".
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    const modelTurn = secondCallBody.messages.at(-2)
    const toolTurn = secondCallBody.messages.at(-1)
    expect(modelTurn).toEqual(assistantMessage)
    expect(toolTurn.role).toBe('tool')
    expect(toolTurn.tool_call_id).toBe('call-1')
    expect(JSON.parse(toolTurn.content)).toEqual({ lineas: ['Alfa'] })
  })

  it('fuerza tool_choice "none" en la última iteración', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                { id: 'x', type: 'function', function: { name: 'listar_lineas', arguments: '{}' } },
              ],
            },
          },
        ],
      }),
    )
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.reply).toMatch(/No pude completar/)

    const lastCallBody = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(lastCallBody.tool_choice).toBe('none')
  })

  it('envuelve el error de una tool en el mensaje de rol "tool"', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'score_de_linea', arguments: '{"linea":"Zzz"}' },
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okResponse({ choices: [{ message: { content: 'No encontré esa línea.' } }] }),
      )

    await handler(makeEvent({ messages: [{ role: 'user', text: '¿Cómo va Zzz?' }] }))
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    const toolTurn = secondCallBody.messages.at(-1)
    expect(JSON.parse(toolTurn.content).error).toMatch(/No se encontró la línea/)
  })

  it('responde 502 si OpenRouter devuelve un status de error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(502)
  })

  it('responde 500 si falla la carga del dataset', async () => {
    loadMetricsDatasetMock.mockRejectedValue(new Error('db down'))
    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(500)
  })

  it('corta el loop con un mensaje amigable si se excede el presupuesto de tiempo total', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const assistantMessage = {
      role: 'assistant',
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'listar_lineas', arguments: '{}' } },
      ],
    }
    // Cada llamada a OpenRouter "tarda" 25s (más que el presupuesto de 24s), simulando
    // un caso donde varias vueltas del loop terminarían chocando con el timeout de Netlify.
    fetchMock.mockImplementation(async () => {
      now += 25000
      return okResponse({ choices: [{ message: assistantMessage }] })
    })

    const res = await handler(makeEvent({ messages: [{ role: 'user', text: 'hola' }] }))
    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.reply).toMatch(/tardando más de lo normal/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
