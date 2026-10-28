import { describe, expect, it } from 'vitest'
import { normalizeUsername, validUsername, validPassword } from './validation'
import { assertScope, setScope, enforceAccounts, currentScope } from './scope'
describe('Account input e isolamento contesto', () => {
  it('normalizza @ e maiuscole e valida username', () => {
    expect(normalizeUsername(' @LUCA_2000 ')).toBe('luca_2000')
    expect(validUsername('ab')).toBe(false)
    expect(validUsername('abc def')).toBe(false)
    expect(validUsername('marta')).toBe(true)
  })
  it('rifiuta password senza requisiti e applica policy server più forte', () => {
    for (const p of ['abc', 'abcdefgh', 'Abcdefgh', 'ABCDEFG!', 'Abcdefg1'])
      expect(validPassword(p)).toBe(false)
    expect(validPassword('Atlas2026!')).toBe(true)
  })
  it('invalida una richiesta dopo cambio utente o mappa', () => {
    setScope({ userId: 'a', mapId: '1' })
    expect(() => assertScope({ userId: 'a', mapId: '1' })).not.toThrow()
    setScope({ userId: 'a', mapId: '2' })
    expect(() => assertScope({ userId: 'a', mapId: '1' })).toThrow()
    setScope(null)
  })
  it('blocca qualunque fallback locale senza sessione nella modalità account', () => {
    setScope(null)
    enforceAccounts()
    expect(() => currentScope()).toThrow(/Sessione/)
    setScope({ userId: 'a', mapId: '1' })
    expect(currentScope()?.userId).toBe('a')
    setScope(null)
  })
})
