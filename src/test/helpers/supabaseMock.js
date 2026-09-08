import { vi } from 'vitest'

// Factory compartido de mock de Supabase para tests (ver docs/QA_BLINDAJE.md 2.3).
// Antes cada test duplicaba su propio mock inline con dos estilos distintos; esto
// centraliza la verdad sobre cómo responde el cliente falso, para que "el test pasa"
// signifique lo mismo en todos los archivos.

/**
 * Query builder thenable que imita el encadenado real de supabase-js
 * (`.select().eq().order()` etc.) y resuelve a `{ data, error }` tanto en
 * `await query` como en `.single()`/`.maybeSingle()`.
 *
 * @param {any[]|object} result - filas a devolver. Si es array, `.single()`/
 *   `.maybeSingle()` devuelven el primer elemento; si es un objeto, se devuelve tal cual.
 * @param {{error?: any}} opts
 */
export function makeQuery(result = [], { error = null } = {}) {
  const data = result
  const singleData = Array.isArray(data) ? (data[0] ?? null) : data

  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    neq: vi.fn(() => q),
    is: vi.fn(() => q),
    in: vi.fn(() => q),
    not: vi.fn(() => q),
    or: vi.fn(() => q),
    gt: vi.fn(() => q),
    gte: vi.fn(() => q),
    lt: vi.fn(() => q),
    lte: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    range: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    upsert: vi.fn(() => q),
    delete: vi.fn(() => q),
    single: vi.fn().mockResolvedValue({ data: singleData, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error }),
  }
  // Hace el objeto thenable para que `await supabase.from(...).select().eq()` resuelva.
  q.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject)
  return q
}

export function makeChannel() {
  return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
}

/**
 * Crea el objeto `supabase` mockeado completo, para usar dentro de
 * `vi.mock('../supabase', () => ({ supabase: createSupabaseMock({ tables: {...} }) }))`.
 *
 * @param {object} opts
 * @param {Record<string, any[]|object|((table: string) => any)>} opts.tables -
 *   mapea nombre de tabla -> filas a devolver, o una función `(table) => query`
 *   para lógica custom por tabla (ej. distintos resultados según filtros).
 * @param {any[]} opts.rpc - resultado por defecto de `supabase.rpc(...)`.
 * @param {object} opts.auth - overrides parciales de `supabase.auth`.
 */
export function createSupabaseMock({ tables = {}, rpc = [], auth = {} } = {}) {
  const from = vi.fn((table) => {
    const entry = tables[table]
    if (typeof entry === 'function') return entry(table)
    return makeQuery(entry ?? [])
  })

  return {
    from,
    channel: vi.fn(() => makeChannel()),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: rpc, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...auth,
    },
  }
}
