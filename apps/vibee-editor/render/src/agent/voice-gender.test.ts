import { describe, expect, it } from 'vitest'
import { sendCardLine, voiceLine } from './chat'

/**
 * "Поняла, Дмитрий" -- THE AGENT'S GRAMMATICAL GENDER. // cyrillic-ok
 *
 * Owner, 2026-09-24: his agent wrote about itself in the feminine. Pinned:
 * the agent's own voice is masculine and says so with the forms, and the
 * voice AS the owner follows the owner's own messages instead of assuming a
 * man -- with gender-free forms when it cannot tell.
 */
describe('voiceLine', () => {
  it('the agent speaks of itself in the masculine, and names the forms', () => {
    const l = voiceLine('miniapp')
    expect(l).toContain('мужском роде') // cyrillic-ok
    expect(l).toContain('«понял»') // cyrillic-ok
    expect(l).toContain('Никогда «поняла»') // cyrillic-ok
  })

  it('writing as the owner follows the owner, not a default', () => {
    const l = voiceLine('business')
    expect(l).toContain('как в ЕГО собственных сообщениях') // cyrillic-ok
    expect(l).toContain('формами без рода') // cyrillic-ok
    expect(l).not.toContain('ТОЛЬКО в мужском') // cyrillic-ok
  })
})

/**
 * WHERE THE SEND BUTTON IS (owner, 2026-09-24: the agent sent him to the bot
 * for a card the app now draws under the answer).
 */
describe('sendCardLine', () => {
  it('in the app and the bot: the card is under the answer, not elsewhere', () => {
    const l = sendCardLine('miniapp')
    expect(l).toContain('ПРЯМО ПОД твоим ответом') // cyrillic-ok
    expect(l).toContain('Не отправляй владельца искать её') // cyrillic-ok
  })
  it('in the business DM: nothing (the client never sees cards)', () => {
    expect(sendCardLine('business')).toBe('')
  })
})
