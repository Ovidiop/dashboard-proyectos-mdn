import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { addMonths, addYears, format } from 'date-fns'
import { es } from 'date-fns/locale'

/** Mes actual en formato "YYYY-MM" (local), para inicializar el selector de período. */
export function thisMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthStrToDate(str) {
  const [y, m] = str.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export function dateToMonthStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CHEVRON_LEFT = 'M6 1L2 4l4 3'
const CHEVRON_RIGHT = 'M2 1l4 3-4 3'

/**
 * Selector de mes con flechas anterior/siguiente y un popover para elegir
 * mes/año rápido (grid de 12 meses + navegación de año), en español. Extraído de
 * Mi Perfil v2 (Evaluaciones) para reusarlo en cualquier vista con período mensual
 * (ver también módulo Chequeo). `value` es un string "YYYY-MM" siempre válido; cualquier
 * toggle adicional (ej. "Histórico") vive en el componente padre, fuera de este selector.
 */
export default function MonthPeriodPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [pickerDate, setPickerDate] = useState(() => monthStrToDate(value))
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const current = monthStrToDate(value)

  function openPicker() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setPickerDate(current)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const fn = (e) => {
      if (!popoverRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  function step(delta) {
    onChange(dateToMonthStr(addMonths(current, delta)))
  }

  function pickMonth(monthIdx0) {
    onChange(dateToMonthStr(new Date(pickerDate.getFullYear(), monthIdx0, 1)))
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Mes anterior"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d={CHEVRON_LEFT} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={openPicker}
          className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#111] border border-[#e0ddd4] hover:border-[#bbb] bg-white transition-all capitalize min-w-[150px] text-center"
        >
          {format(current, 'MMMM yyyy', { locale: es })}
        </button>

        {open &&
          createPortal(
            <div
              ref={popoverRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
              className="bg-white border border-[#e8e5db] rounded-xl shadow-lg p-3 w-56"
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setPickerDate((d) => addYears(d, -1))}
                  aria-label="Año anterior"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d={CHEVRON_LEFT} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="text-[13px] font-semibold text-[#111]">{pickerDate.getFullYear()}</p>
                <button
                  type="button"
                  onClick={() => setPickerDate((d) => addYears(d, 1))}
                  aria-label="Año siguiente"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d={CHEVRON_RIGHT} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, i) => {
                  const label = format(new Date(2000, i, 1), 'MMM', { locale: es })
                  const isSelected =
                    pickerDate.getFullYear() === current.getFullYear() && i === current.getMonth()
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickMonth(i)}
                      className={`text-[12.5px] rounded-md py-1.5 capitalize transition-colors ${
                        isSelected
                          ? '!bg-[#111] !text-white font-semibold'
                          : 'text-[#333] hover:bg-[#f5f3eb]'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body,
          )}
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Mes siguiente"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d={CHEVRON_RIGHT} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {value !== thisMonthStr() && (
        <button
          type="button"
          onClick={() => onChange(thisMonthStr())}
          className="px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors whitespace-nowrap"
        >
          Mes actual
        </button>
      )}
    </div>
  )
}
