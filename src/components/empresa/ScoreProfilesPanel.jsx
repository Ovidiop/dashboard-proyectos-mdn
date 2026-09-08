import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase'
import { INDICATORS } from '../../utils/employeeScore'
import { resolveProfile } from '../../utils/employeeScoreProfiles'

/** Describe en texto legible a quién matchea un perfil no-default. */
function describeMatch(match, departments, positions) {
  if (!match || Object.keys(match).length === 0) return null
  if (match.position_ids?.length) {
    const names = match.position_ids
      .map((id) => positions.find((p) => String(p.position_id) === String(id))?.position_name)
      .filter(Boolean)
    return `Cargo: ${names.join(', ') || '—'}`
  }
  if (match.department_ids?.length) {
    const names = match.department_ids
      .map((id) => departments.find((d) => String(d.department_id) === String(id))?.department_name)
      .filter(Boolean)
    return `Departamento: ${names.join(', ') || '—'}`
  }
  if (match.min_level != null) return `Nivel de acceso ≥ ${match.min_level}`
  return null
}

/**
 * Configuración de los perfiles de peso por cargo de la Evaluación automática de
 * desempeño (ver ARQUITECTURA.md §2.7). Solo edita `weights` — el `match` (a qué
 * cargo/departamento aplica cada perfil) queda fuera de esta versión para no abrir
 * la puerta a re-mapear perfiles sin pensarlo; se siembra una vez por migración.
 *
 * Los cambios NUNCA alcanzan a un mes ya congelado: employee_score_snapshots es
 * inmutable (ver 20260917000000_create_employee_scores.sql), así que editar un peso
 * solo se refleja en el mes en curso (cálculo en vivo) hacia adelante.
 */
export default function ScoreProfilesPanel({ companyId, userId }) {
  const [profiles, setProfiles] = useState([])
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [drafts, setDrafts] = useState({})

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    const [profilesRes, usersRes, deptRes, posRes] = await Promise.all([
      supabase
        .from('employee_score_profiles')
        .select('*')
        .eq('company_id', companyId)
        .order('is_default', { ascending: false })
        .order('name'),
      supabase
        .from('users')
        .select('user_id, first_name, last_name, department_id, position_id, access_level')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      supabase.from('departments').select('*').eq('company_id', companyId),
      supabase.from('positions').select('*').eq('company_id', companyId),
    ])
    if (profilesRes.error) {
      setError(profilesRes.error.message)
      setLoading(false)
      return
    }
    setProfiles(profilesRes.data ?? [])
    setUsers(usersRes.data ?? [])
    setDepartments(deptRes.data ?? [])
    setPositions(posRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  // Preview en vivo: para cada empleado activo, qué perfil le aplica HOY con la
  // configuración actual (incluye ediciones sin guardar, para ver el efecto antes de
  // confirmar).
  const previewProfiles = useMemo(
    () => profiles.map((p) => (drafts[p.id] ? { ...p, weights: drafts[p.id] } : p)),
    [profiles, drafts],
  )
  const matchCounts = useMemo(() => {
    const counts = {}
    previewProfiles.forEach((p) => {
      counts[p.id] = 0
    })
    users.forEach((u) => {
      const profile = resolveProfile(u, previewProfiles)
      if (profile) counts[profile.id] = (counts[profile.id] ?? 0) + 1
    })
    return counts
  }, [users, previewProfiles])

  function draftWeights(profile) {
    return drafts[profile.id] ?? profile.weights
  }

  function setWeight(profile, key, value) {
    setDrafts((d) => ({ ...d, [profile.id]: { ...draftWeights(profile), [key]: value } }))
  }

  function isDirty(profile) {
    const draft = drafts[profile.id]
    if (!draft) return false
    return INDICATORS.some((i) => Number(draft[i.key] ?? 0) !== Number(profile.weights[i.key] ?? 0))
  }

  function discardDraft(profile) {
    setDrafts((d) => {
      const next = { ...d }
      delete next[profile.id]
      return next
    })
  }

  async function save(profile) {
    const weights = draftWeights(profile)
    const clean = {}
    INDICATORS.forEach((i) => {
      clean[i.key] = Math.max(0, Number(weights[i.key] ?? 0))
    })
    setSavingId(profile.id)
    setError(null)
    const { error: err } = await supabase
      .from('employee_score_profiles')
      .update({ weights: clean, updated_at: new Date().toISOString(), updated_by: userId ?? null })
      .eq('id', profile.id)
    setSavingId(null)
    if (err) {
      setError(err.message)
      return
    }
    setProfiles((ps) => ps.map((p) => (p.id === profile.id ? { ...p, weights: clean } : p)))
    discardDraft(profile)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-[14px] text-[#888]">
        Cada perfil define cuánto pesa cada indicador para los empleados que le matchean. Un peso en
        0 significa que ese indicador nunca aplica a ese cargo; el resto se redistribuye entre los
        que sí aplican. Editar un peso solo afecta el mes en curso — los meses ya cerrados quedan
        congelados y no se recalculan solos.
      </p>

      {profiles.map((profile) => {
        const weights = draftWeights(profile)
        const dirty = isDirty(profile)
        const matchLabel = profile.is_default
          ? 'Perfil por defecto — se usa cuando ningún otro perfil matchea'
          : describeMatch(profile.match, departments, positions)

        return (
          <div key={profile.id} className="bg-white rounded-2xl border border-[#e0ddd4] p-5">
            <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
              <div>
                <p className="text-[15.5px] font-bold text-[#111]">{profile.name}</p>
                {matchLabel && <p className="text-[13px] text-[#999]">{matchLabel}</p>}
              </div>
              <span className="text-[13px] font-mono font-semibold px-2.5 py-1 rounded-full bg-[#f5f3eb] text-[#666]">
                {matchCounts[profile.id] ?? 0} empleado
                {(matchCounts[profile.id] ?? 0) === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {INDICATORS.map((ind) => (
                <label
                  key={ind.key}
                  className="flex items-center justify-between gap-2 text-[13.5px]"
                >
                  <span className="text-[#555] truncate">{ind.label}</span>
                  <input
                    type="number"
                    min={0}
                    className="input-base w-16 text-right px-2 py-1"
                    value={weights[ind.key] ?? 0}
                    onChange={(e) => setWeight(profile, ind.key, e.target.value)}
                  />
                </label>
              ))}
            </div>

            {dirty && (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#f0ede3]">
                <button
                  type="button"
                  onClick={() => save(profile)}
                  disabled={savingId === profile.id}
                  className="px-4 py-1.5 rounded-lg text-[13.5px] font-semibold bg-[#111] text-white hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  {savingId === profile.id ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => discardDraft(profile)}
                  disabled={savingId === profile.id}
                  className="px-4 py-1.5 rounded-lg text-[13.5px] font-semibold text-[#666] hover:bg-[#f5f3eb] transition-colors"
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
