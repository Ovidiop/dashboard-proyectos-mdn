import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'

const MAX_CRITERIA_PER_POSITION = 4

function emptyDraft() {
  return { icon: '⭐', name: '', description: '' }
}

/**
 * Configuración de los criterios subjetivos que evalúa el jefe por cargo, una vez al
 * mes (tabla `evaluation_criteria`, ver ARQUITECTURA.md §2.7). Selector de cargo →
 * lista editable de criterios (icono, nombre, descripción, orden, activo). Máximo
 * 4 criterios por cargo — más que eso deja de ser una evaluación rápida mensual.
 *
 * Se edita con la misma capability que ScoreProfilesPanel (evaluaciones.perfiles.manage):
 * ambos configuran "qué mide el sistema de desempeño para este cargo", uno automático
 * y otro subjetivo, y viven en la misma pestaña de Empresa.
 */
export default function CriteriaByPositionPanel({ companyId, userId }) {
  const [positions, setPositions] = useState([])
  const [criteria, setCriteria] = useState([])
  const [selectedPositionId, setSelectedPositionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(emptyDraft())

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    const [posRes, critRes] = await Promise.all([
      supabase
        .from('positions')
        .select('position_id, position_name')
        .eq('company_id', companyId)
        .order('position_name'),
      supabase
        .from('evaluation_criteria')
        .select('*')
        .eq('company_id', companyId)
        .order('position_id')
        .order('sort_order'),
    ])
    if (posRes.error) {
      setError(posRes.error.message)
      setLoading(false)
      return
    }
    if (critRes.error) {
      setError(critRes.error.message)
      setLoading(false)
      return
    }
    setPositions(posRes.data ?? [])
    setCriteria(critRes.data ?? [])
    setSelectedPositionId((prev) => prev ?? posRes.data?.[0]?.position_id ?? null)
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const positionCriteria = criteria
    .filter((c) => c.position_id === selectedPositionId)
    .sort((a, b) => a.sort_order - b.sort_order)

  async function addCriterion(e) {
    e.preventDefault()
    if (!draft.name.trim()) {
      setError('El nombre del criterio es obligatorio.')
      return
    }
    if (positionCriteria.length >= MAX_CRITERIA_PER_POSITION) {
      setError(`Máximo ${MAX_CRITERIA_PER_POSITION} criterios por cargo.`)
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('evaluation_criteria')
      .insert({
        company_id: companyId,
        position_id: selectedPositionId,
        sort_order: positionCriteria.length,
        icon: draft.icon.trim() || null,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        active: true,
        updated_by: userId ?? null,
      })
      .select()
      .single()
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setCriteria((cs) => [...cs, data])
    setDraft(emptyDraft())
  }

  async function toggleActive(criterion) {
    setError(null)
    const { data, error: err } = await supabase
      .from('evaluation_criteria')
      .update({
        active: !criterion.active,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      })
      .eq('id', criterion.id)
      .select()
      .single()
    if (err) {
      setError(err.message)
      return
    }
    setCriteria((cs) => cs.map((c) => (c.id === criterion.id ? data : c)))
  }

  async function removeCriterion(criterion) {
    setError(null)
    const { error: err } = await supabase
      .from('evaluation_criteria')
      .delete()
      .eq('id', criterion.id)
    if (err) {
      setError(err.message)
      return
    }
    setCriteria((cs) => cs.filter((c) => c.id !== criterion.id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-[14px] text-[#888]">
        Los criterios que evalúa el jefe una vez al mes, por cargo. Cada cargo puede tener hasta{' '}
        {MAX_CRITERIA_PER_POSITION} criterios; un cargo sin criterios no muestra el bloque de
        evaluación del jefe en la ficha de sus empleados.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <select
        className="input-base max-w-sm"
        value={selectedPositionId ?? ''}
        onChange={(e) => setSelectedPositionId(Number(e.target.value))}
      >
        {positions.map((p) => (
          <option key={p.position_id} value={p.position_id}>
            {p.position_name}
          </option>
        ))}
      </select>

      <div className="bg-white rounded-2xl border border-[#e0ddd4] p-5 space-y-3">
        {positionCriteria.length === 0 ? (
          <p className="text-[14.5px] text-[#bbb]">Este cargo no tiene criterios configurados.</p>
        ) : (
          positionCriteria.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#e0ddd4] ${
                c.active ? '' : 'opacity-50'
              }`}
            >
              {c.icon && <span className="text-[16px]">{c.icon}</span>}
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-semibold text-[#111] truncate">{c.name}</p>
                {c.description && (
                  <p className="text-[12.5px] text-[#999] truncate">{c.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleActive(c)}
                className="text-[13px] font-semibold text-[#666] hover:text-[#111] transition-colors"
              >
                {c.active ? 'Desactivar' : 'Activar'}
              </button>
              <button
                type="button"
                onClick={() => removeCriterion(c)}
                aria-label={`Quitar ${c.name}`}
                className="text-[#ccc] hover:text-red-400 transition-colors p-1"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))
        )}

        {positionCriteria.length < MAX_CRITERIA_PER_POSITION && (
          <form onSubmit={addCriterion} className="flex items-center gap-2 pt-2">
            <input
              type="text"
              className="input-base w-16 text-center px-2"
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              placeholder="⭐"
              aria-label="Ícono"
            />
            <input
              type="text"
              className="input-base flex-1"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Nombre del criterio"
            />
            <input
              type="text"
              className="input-base flex-1"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Descripción (opcional)"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {saving ? 'Agregando…' : 'Agregar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
