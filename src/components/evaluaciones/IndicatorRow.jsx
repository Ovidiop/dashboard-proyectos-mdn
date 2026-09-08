/**
 * Fila de un indicador dentro de ScoreBreakdownCard. Un indicador que no aplicó ese
 * mes (sin volumen suficiente, o peso 0 en el perfil) se muestra atenuado con una
 * nota — nunca como un 0% engañoso (ver src/utils/employeeScore.js).
 */
export default function IndicatorRow({ label, pct, pesoBase, pesoEfectivo, aplica, unidades }) {
  const pctLabel = aplica && pct != null ? `${Math.round(pct * 100)}%` : '—'
  const barColor = !aplica ? '#e0ddd4' : pct >= 0.8 ? '#16A34A' : pct >= 0.6 ? '#FFB800' : '#E14848'

  return (
    <div className={`py-2.5 ${!aplica ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[14.5px] font-semibold text-[#111]">{label}</span>
        <span className="text-[14.5px] font-mono font-bold text-[#111]">{pctLabel}</span>
      </div>
      <div className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: aplica ? `${Math.min(100, Math.max(0, (pct ?? 0) * 100))}%` : '0%',
            backgroundColor: barColor,
          }}
        />
      </div>
      <p className="text-[12.5px] text-[#999] mt-1">
        {aplica
          ? `Peso ${Math.round(pesoBase)} → ${Math.round(pesoEfectivo)} efectivo · ${unidades} unidades`
          : pesoBase === 0
            ? 'No aplica a tu cargo'
            : 'Sin datos suficientes este mes'}
      </p>
    </div>
  )
}
