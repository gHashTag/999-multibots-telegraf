import { describe, expect, it } from 'vitest'
import { cardMenuRows, settledRows } from '@/navigation/helpers/crmMenu'

/*
 * A CARD THAT HAS BEEN PRESSED SAYS WHAT HAPPENED.
 *
 * Issue #2418, named again by #2783 as the piece still missing on main: the
 * press cleared the WHOLE markup, including the card's own history row, and
 * the verdict arrived as a separate message. Half an hour later the card
 * itself carried no trace of what was decided about it -- which on a phone,
 * scrolled past, is a card the owner cannot read the outcome of at all.
 */
const LEAD = '900000051'

describe('a pressed card says what happened', () => {
  it('puts the outcome on the card, unpressable', () => {
    const rows = settledRows('✅ Отправлено', LEAD)
    expect(rows[0][0].text).toBe('✅ Отправлено')
    // Bot API 10.3: the button stays, the press does not.
    expect(rows[0][0].disabled).toBe(true)
  })

  it('keeps the history row, which the press never owned', () => {
    const rows = settledRows('✋ Не отправлено', LEAD)
    expect(rows).toHaveLength(2)
    expect(JSON.stringify(rows[1])).toContain(`crm:lead:${LEAD}`)
    // The same row the card carried before the press.
    expect(rows[1]).toEqual(cardMenuRows(LEAD)[0])
  })

  it('a card with no lead settles to the outcome alone', () => {
    // takeCardLead forgets after fifteen minutes; a press after lunch still
    // has an outcome to show even when the person is no longer known.
    const rows = settledRows('✅ Отправлено', null)
    expect(rows).toHaveLength(1)
    expect(rows[0][0].text).toBe('✅ Отправлено')
  })

  it('never lets a long word become a button Telegram refuses', () => {
    const rows = settledRows('о'.repeat(120), LEAD)
    expect(String(rows[0][0].text)).toHaveLength(40)
  })

  it('the two outcomes are distinguishable, or the card says nothing', () => {
    const sent = settledRows('✅ Отправлено', LEAD)[0][0].text
    const not = settledRows('✋ Не отправлено', LEAD)[0][0].text
    expect(sent).not.toBe(not)
  })

  it('both presses settle the card, and the fallback still clears it', async () => {
    /*
     * A source read: the handlers reach Telegram and the proposal store. What
     * is worth pinning is narrow -- BOTH presses settle, and a host that
     * refuses `disabled` (our own Bot API server may predate 10.3) still ends
     * with the buttons gone rather than pressable twice.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toContain("settleButtons(ctx, '✅ Отправлено', lead)")
    expect(src).toContain("settleButtons(ctx, '✋ Не отправлено', lead)")
    const at = src.indexOf('const settleButtons =')
    expect(src.slice(at, at + 900)).toContain('await stripButtons(ctx)')
  })
})
