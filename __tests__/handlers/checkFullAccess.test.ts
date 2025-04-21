import { checkFullAccess } from '@/handlers/checkFullAccess'

describe('checkFullAccess', () => {
  const valid = ['neurophoto', 'neurobase', 'neuromeeting', 'neuroblogger', 'neurotester']
  for (const sub of valid) {
    it(`returns true for subscription '${sub}'`, () => {
      expect(checkFullAccess(sub)).toBe(true)
    })
  }
  it('returns false for unknown subscription', () => {
    expect(checkFullAccess('random')).toBe(false)
  })
  it('returns false for empty string', () => {
    expect(checkFullAccess('')).toBe(false)
  })
})