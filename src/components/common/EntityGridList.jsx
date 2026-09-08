/**
 * Piezas compartidas para listas de entidades (empleados / marcas) con dos
 * vistas conmutables: "tarjetas" (grid) y "lista" (filas). Usadas por
 * LineHubView (Reportes) y LineFichaModal (Empresa).
 */

/** Pill conmutador Lista / Tarjetas. */
export function ViewToggle({ view, onChange }) {
  return (
    <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={view === 'lista'}
        className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
          view === 'lista' ? 'bg-white text-[#111] shadow-sm' : 'text-[#888] hover:text-[#555]'
        }`}
        title="Vista lista"
      >
        Lista
      </button>
      <button
        type="button"
        onClick={() => onChange('tarjetas')}
        aria-pressed={view === 'tarjetas'}
        className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
          view === 'tarjetas' ? 'bg-white text-[#111] shadow-sm' : 'text-[#888] hover:text-[#555]'
        }`}
        title="Vista tarjetas"
      >
        Tarjetas
      </button>
    </div>
  )
}

/** Avatar/logo circular con fallback de texto. fallbackBg null → estilo gris (marcas). */
function EntityAvatar({ item, sizeClass, textClass }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]`}
      />
    )
  }
  if (item.fallbackBg) {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center ${textClass} font-bold text-white flex-shrink-0`}
        style={{ background: item.fallbackBg }}
      >
        {item.fallbackText}
      </div>
    )
  }
  return (
    <span
      className={`${sizeClass} rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 ${textClass} font-bold text-[#aaa] uppercase`}
    >
      {item.fallbackText}
    </span>
  )
}

/**
 * Lista de entidades clickeables en vista "tarjetas" (grid) o "lista" (filas).
 * Props:
 *   items       — [{ id, name, secondary, imageUrl, fallbackText, fallbackBg, title, raw }]
 *   view        — "lista" | "tarjetas"
 *   onItemClick — (raw) => void
 *   gridClass   — clases del contenedor grid en vista tarjetas
 */
export default function EntityGridList({
  items,
  view,
  onItemClick,
  gridClass = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2',
}) {
  if (view === 'tarjetas') {
    return (
      <div className={gridClass}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onItemClick(item.raw)}
            className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] bg-[#faf9f5] text-center transition-colors ${
              item.disabled ? 'cursor-default' : 'hover:bg-[#f0ede3] hover:border-[#d0ccc0]'
            }`}
            title={item.title}
          >
            <EntityAvatar item={item} sizeClass="w-10 h-10" textClass="text-[13px]" />
            <div className="w-full min-w-0">
              <p className="text-[13px] font-medium text-[#333] truncate">{item.name}</p>
              {item.secondary && (
                <p className="text-[11px] text-[#aaa] truncate">{item.secondary}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => !item.disabled && onItemClick(item.raw)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-[#e0ddd4] text-left transition-colors ${
            item.disabled ? 'cursor-default' : 'hover:bg-[#fafaf7] hover:border-[#d0ccc0]'
          }`}
          title={item.title}
        >
          <EntityAvatar item={item} sizeClass="w-8 h-8" textClass="text-[12px]" />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#333] truncate">{item.name}</p>
            {item.secondary && (
              <p className="text-[11.5px] text-[#aaa] truncate">{item.secondary}</p>
            )}
          </div>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="text-[#ccc] flex-shrink-0"
          >
            <path d="M2 5h6M5 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  )
}
