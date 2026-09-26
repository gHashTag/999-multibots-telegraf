import { describe, expect, it } from 'vitest'
import {
  crmCallback,
  giftButton,
  leadMenu,
  LEAD_VERBS,
} from '@/navigation/helpers/crmMenu'

/*
 * THE GIFT, WITHOUT ANSWERING FIRST.
 *
 * Owner, 2026-09-24: "why can't I choose the gift photo straight away --
 * there is a Reply button, and I do not want to reply in text, I want to send
 * the gift and draw them into the bot".
 *
 * The one button on a person's row was the render's FORECAST, so when it
 * forecast "reply" there was no way to say "not a letter, a portrait". A
 * forecast is a suggestion; the other move has to be reachable in one press.
 */
const LEAD = '900000051'

describe('the gift is one press away', () => {
  it('stands beside the forecast whatever the forecast says', () => {
    for (const next of ['reply', 'talk', 'offer', null, undefined]) {
      const b = giftButton(LEAD, next as never)
      expect(b, String(next)).toBeTruthy()
      expect((b as never as { text: string }).text).toContain('Подарок')
    }
  })

  it('does NOT double the forecast when the forecast is already the gift', () => {
    // Two identical buttons ask the same question twice.
    expect(giftButton(LEAD, 'deliver')).toBeNull()
  })

  it('the press is a known verb, so the callback can be built at all', () => {
    expect(LEAD_VERBS).toContain('gift')
    expect(crmCallback('gift', LEAD)).toContain('gift')
  })

  it('a malformed id never becomes a button', () => {
    // The verb list and the id shape are both checked when the data is built.
    expect(() => crmCallback('gift', 'not-an-id')).toThrow()
  })

  it("it is in the person's own menu, on the row with the forecast", () => {
    const rows = leadMenu(LEAD, { next: 'reply' }).reply_markup.inline_keyboard
    const labels = rows[0].map((b: { text: string }) => b.text)
    expect(labels[0]).toContain('Ответить')
    expect(labels[1]).toContain('Подарок')
  })

  it('and it is absent there too when the forecast is the gift', () => {
    const rows = leadMenu(LEAD, { next: 'deliver' }).reply_markup
      .inline_keyboard
    expect(rows[0]).toHaveLength(1)
    expect(rows[0][0].text).toContain('Фото 9:16')
  })

  it('the press has a handler, and it asks for the gift, not a letter', async () => {
    /*
     * A source read: the handler runs a whole turn through the agent and the
     * proposal queue, which no mock reproduces. The promise worth pinning is
     * narrow -- the press exists, and the brief it sends says "no letter".
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const at = src.indexOf("if (verb === 'gift')")
    expect(at, 'nothing answers the gift press').toBeGreaterThan(-1)
    const body = src.slice(at, at + 1400)
    expect(body).toContain('crm_deliver_photo')
    expect(body).toContain('pressOnce')
  })
})
