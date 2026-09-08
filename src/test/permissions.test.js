import { describe, it, expect } from 'vitest'
import { canViewEmployeeFicha } from '../lib/permissions'

describe('canViewEmployeeFicha', () => {
  it('admin puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: true, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 3 puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 3 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 4 puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 4 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 2 NO puede ver la ficha de otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 2 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(false)
  })

  it('nivel 1 NO puede ver la ficha de otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(false)
  })

  it('nivel 1-2 SÍ puede ver su propia ficha', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-1')).toBe(true)
  })

  it('userProfile null → false', () => {
    expect(canViewEmployeeFicha(null, 'u-2')).toBe(false)
  })

  it('sin targetUserId → false para nivel bajo', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, undefined)).toBe(false)
  })
})
