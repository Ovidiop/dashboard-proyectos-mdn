/**
 * Test estructural (sin render) del patrón "header y footer fijos, contenido
 * scrolleable" en todos los modales del proyecto.
 *
 * En vez de montar cada modal (muchos requieren datos/mocks distintos), este test
 * lee el código fuente y verifica que cada panel:
 *  - use `flex flex-col` en el contenedor con `max-h-[...]` (no `overflow-y-auto`
 *    en ese mismo elemento).
 *  - tenga al menos un contenedor de contenido con `flex-1` + `overflow-y-auto`
 *    (el área que realmente scrollea).
 *  - marque su header (y footer, cuando aplica) con `flex-shrink-0` para que no
 *    se compriman ni se desplacen con el scroll.
 *
 * Referencia del patrón: src/components/tareas/TaskModal.jsx (cubierto por
 * src/test/taskModalLayout.test.jsx).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..', '..')

function src(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8')
}

// ── Casos: modales con header + footer de acciones ─────────────────────────────
const MODALS_WITH_FOOTER = [
  'src/components/empresa/ClientModal.jsx',
  'src/components/empresa/EmployeeModal.jsx',
  'src/components/empresa/PositionModal.jsx',
  'src/components/empresa/NewEmployeeDialog.jsx',
  'src/components/empresa/QuestionModal.jsx',
  'src/components/ads/AdsForm.jsx',
  'src/components/ads/AdsSpendForm.jsx',
  'src/components/ads/AdsResultsModal.jsx',
  'src/components/reuniones/MeetingModal.jsx',
  'src/components/empresa/LineMetasModal.jsx',
  'src/components/ads/AdsDetail.jsx',
  'src/components/ads/AdsSpendDetail.jsx',
  'src/components/pautas/PautaDetailModal.jsx',
]

// ── Casos: modales con header fijo pero sin footer de acciones separado ────────
const MODALS_HEADER_ONLY = [
  'src/components/empresa/VacationsDialog.jsx',
  'src/components/reuniones/MeetingDetail.jsx',
  'src/components/reuniones/CalendarView.jsx',
  'src/components/tickets/TicketDetail.jsx',
  'src/components/ads/AdsBudgetOverview.jsx',
]

// ── Casos: "cuerpo embebible" sin overlay propio (fragment). Su `flex flex-col`
// vive en el wrapper que lo monta (ClientFichaModal / EmployeeInfoModal /
// LineFichaModal), así que solo se verifica header/contenido, no el panel.
const FICHA_CONTENT_FRAGMENTS = [
  'src/components/metricas/ClientFichaContent.jsx',
  'src/components/metricas/EmployeeFichaContent.jsx',
]

describe('Modales — panel flex-col con header/footer fijos y contenido scrolleable', () => {
  it.each(MODALS_WITH_FOOTER)(
    '%s: panel flex-col, contenido scrolleable, header y footer fijos',
    (path) => {
      const code = src(path)
      expect(code).toMatch(/flex flex-col/)
      expect(code).toMatch(/flex-1[^"]*overflow-y-auto|overflow-y-auto[^"]*flex-1/)
      expect(code).toMatch(/flex-shrink-0/)
      // El footer (fila de botones) debe llevar border-t y flex-shrink-0.
      expect(code).toMatch(/flex-shrink-0[^"]*border-t|border-t[^"]*flex-shrink-0/)
    },
  )

  it.each(MODALS_HEADER_ONLY)(
    '%s: panel/header flex-col con flex-shrink-0 y contenido flex-1 overflow-y-auto',
    (path) => {
      const code = src(path)
      expect(code).toMatch(/flex flex-col/)
      expect(code).toMatch(/flex-1[^"]*overflow-y-auto|overflow-y-auto[^"]*flex-1/)
      expect(code).toMatch(/flex-shrink-0/)
    },
  )

  it.each(FICHA_CONTENT_FRAGMENTS)(
    '%s: header flex-shrink-0 y cuerpo flex-1 overflow-y-auto (el panel flex-col vive en el wrapper)',
    (path) => {
      const code = src(path)
      expect(code).toMatch(/flex-shrink-0/)
      expect(code).toMatch(/flex-1[^"]*overflow-y-auto|overflow-y-auto[^"]*flex-1/)
    },
  )

  it('LineFichaModal: panel flex-col, barra "Volver" y header de línea con flex-shrink-0, contenido flex-1 overflow-y-auto', () => {
    const code = src('src/components/empresa/LineFichaModal.jsx')
    expect(code).toMatch(/flex flex-col/)
    expect(code).toMatch(/flex-1 overflow-y-auto/)
    expect(code).toMatch(/flex-shrink-0/)
  })

  it('ClientFichaModal / EmployeeInfoModal: wrapper usa panel flex-col (el header/body vive en *FichaContent)', () => {
    const clientWrapper = src('src/components/metricas/ClientFichaModal.jsx')
    const employeeWrapper = src('src/components/metricas/EmployeeInfoModal.jsx')
    expect(clientWrapper).toMatch(/flex flex-col/)
    expect(clientWrapper).not.toMatch(/max-h-\[90vh\] overflow-y-auto/)
    expect(employeeWrapper).toMatch(/flex flex-col/)
    expect(employeeWrapper).not.toMatch(/max-h-\[90vh\] overflow-y-auto/)
  })

  it('ClientModal y PositionModal ya no usan el hack "sticky top-0 bg-white z-10" en el header', () => {
    expect(src('src/components/empresa/ClientModal.jsx')).not.toMatch(/sticky top-0 bg-white z-10/)
    expect(src('src/components/empresa/PositionModal.jsx')).not.toMatch(
      /sticky top-0 bg-white z-10/,
    )
  })

  it.each([...MODALS_WITH_FOOTER, ...MODALS_HEADER_ONLY, ...FICHA_CONTENT_FRAGMENTS])(
    '%s: ningún contenedor combina max-h-[ con overflow-y-auto en el mismo elemento',
    (path) => {
      const code = src(path)
      // Patrón legado: `max-h-[90vh] overflow-y-auto` (o similar) en la misma className.
      expect(code).not.toMatch(/max-h-\[[^\]]+\]\s+overflow-y-auto/)
      expect(code).not.toMatch(/overflow-y-auto\s+max-h-\[[^\]]+\]/)
    },
  )
})
