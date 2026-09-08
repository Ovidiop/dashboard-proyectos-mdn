/**
 * Lógica pura de evaluación de permisos por módulo.
 *
 * Modelo de reglas — Forma Normal Disyuntiva (DNF):
 *   config.rules = [grupo1, grupo2, ...]   ← OR entre grupos
 *   grupo.all   = [condición1, condición2] ← AND dentro del grupo
 *
 * Tipos de condición:
 *   { type: 'department', ids: [number], negate?: boolean }   → department_id ∈ ids
 *   { type: 'min_level',  value: number, negate?: boolean }   → access_level >= value
 *   { type: 'user',       ids: [string], negate?: boolean }   → user_id ∈ ids
 *   { type: 'position',   ids: [number], negate?: boolean }   → position_id ∈ ids
 *
 * Negación: cuando negate === true el resultado de la condición se invierte.
 * IMPORTANTE: negate solo aplica a tipos conocidos; tipo ausente/desconocido
 * siempre devuelve false sin invertir (para no abrir acceso por error).
 *
 * Exclusiones (deny):
 *   config.deny = [condición, ...]  ← lista plana; el usuario queda excluido
 *   si cumple CUALQUIERA de las condiciones (OR). Las exclusiones se evalúan
 *   después del check de admin y ANTES de las reglas de permiso; si alguna
 *   coincide, se deniega el acceso independientemente de lo que digan rules.
 *   Los administradores NUNCA son afectados por deny.
 *
 * Defaults:
 *   - Si userProfile es null/undefined → false
 *   - Si userProfile.admin === true    → true (siempre, incluso si está en deny)
 *   - Si cumple alguna exclusión deny  → false (gana a rules)
 *   - Si no hay reglas configuradas    → true (módulo abierto a todos)
 *   - Un grupo sin condiciones         → true (grupo vacío pasa)
 */

/**
 * @param {string}   moduleKey
 * @param {object}   userProfile  — objeto del contexto Auth (puede ser null)
 * @param {object}   configByModule — { [moduleKey]: { rules: [...] } }
 * @returns {boolean}
 */
/**
 * Alias de canAccessModule para claves de capacidad granulares.
 * Usa la misma firma — el evaluador funciona igual para 'empresa',
 * 'empresa.clientes' o 'empresa.lineas.manage'.
 *
 * @param {string} key - Clave de capacidad (módulo, tab o acción)
 * @param {object} userProfile
 * @param {object} configByModule - { [key]: { rules: [...] } }
 * @returns {boolean}
 */
export const can = canAccessModule

/**
 * Devuelve true si el usuario puede ver/editar información financiera sensible
 * (sueldos de empleados, mensualidad y día de pago de clientes).
 * Requiere ser admin, tener nivel de acceso ≥ 4, o tener la capacidad granular
 * 'empresa.empleados.sensible' (caso RRHH: ver sueldos sin ser admin/nivel alto).
 *
 * @param {object|null} userProfile — objeto del contexto Auth
 * @param {boolean} [hasCapability] — resultado de can('empresa.empleados.sensible')
 * @returns {boolean}
 */
export function isFinancePrivileged(userProfile, hasCapability = false) {
  return userProfile?.admin === true || (userProfile?.access_level ?? 0) >= 3 || hasCapability
}

/**
 * ¿Puede este usuario ver la ficha de un empleado (correo, teléfono, fecha de
 * ingreso, cumpleaños, nivel de acceso)?
 * Nivel de acceso ≥ 3 o admin → la ficha de cualquiera.
 * Nivel 1-2 → únicamente la propia.
 *
 * @param {object|null} userProfile — objeto del contexto Auth
 * @param {string|undefined} targetUserId — user_id del empleado cuya ficha se quiere ver
 * @returns {boolean}
 */
export function canViewEmployeeFicha(userProfile, targetUserId) {
  if (!userProfile) return false
  if (userProfile.admin === true) return true
  if ((userProfile.access_level ?? 0) >= 3) return true
  return !!targetUserId && userProfile.user_id === targetUserId
}

export function canAccessModule(moduleKey, userProfile, configByModule) {
  if (!userProfile) return false
  if (userProfile.admin === true) return true // admin ve todo, incluso si está en deny

  const config = configByModule?.[moduleKey]

  // Exclusiones: si cumple cualquier condición de deny → denegar (gana a rules)
  const deny = config?.deny ?? []
  if (deny.some((cond) => matchCondition(cond, userProfile))) return false

  const rules = config?.rules ?? []

  // Sin reglas = acceso libre
  if (rules.length === 0) return true

  // OR: basta con que un grupo pase
  return rules.some((group) => groupPasses(group, userProfile))
}

/**
 * Un grupo pasa si TODAS sus condiciones se cumplen (AND).
 */
function groupPasses(group, userProfile) {
  const conditions = group?.all ?? []
  if (conditions.length === 0) return true
  return conditions.every((cond) => matchCondition(cond, userProfile))
}

function matchCondition(cond, userProfile) {
  // Tipo ausente → false, NO se invierte (evita apertura por error)
  if (!cond?.type) return false

  let res
  switch (cond.type) {
    case 'department':
      res = Array.isArray(cond.ids) && cond.ids.includes(userProfile.department_id)
      break

    case 'min_level':
      res = (userProfile.access_level ?? 1) >= (cond.value ?? 1)
      break

    case 'user':
      res = Array.isArray(cond.ids) && cond.ids.includes(userProfile.user_id)
      break

    case 'position':
      res = Array.isArray(cond.ids) && cond.ids.includes(userProfile.position_id)
      break

    default:
      // Tipo desconocido → false, NO se invierte
      return false
  }

  return cond.negate ? !res : res
}
