import { describe, it, expect } from 'vitest'
import {
  REWRITE_OPEN_RE,
  REWRITE_BACK_RE,
  REWRITE_STYLE_RE,
  REWRITE_STYLES,
  rewriteStyleById,
  rewriteNote,
  rewriteOpenCallback,
  rewriteBackCallback,
  rewriteStyleCallback,
  rewriteRow,
  rewriteStyleRows,
} from '@/navigation/helpers/rewriteMenu'
import {
  cardKeyboard,
  proposalCard,
  rememberCard,
  forgetCardLeadsForTests,
} from '@/services/telegramProposals'

/**
 * THE REWRITE BUTTONS: every rendered callback is one a handler matches, it
 * fits in Telegram's 64 bytes, and a card that cannot build them loses the
 * buttons rather than the card.
 */
const ID = '0f3a91cc42de'
// secret-guard-ok: invented for this test, in the shape the generator produces
const SECRET = '0'.repeat(24) + 'deadbeef'

const dataOf = (markup: {
  reply_markup: { inline_keyboard: Array<Array<Record<string, string>>> }
}) =>
  markup.reply_markup.inline_keyboard.map(row =>
    row.map(b => String(b.callback_data ?? b.url ?? ''))
  )

describe('the rewrite grammar', () => {
  it('builds each of the three forms, and its own handler matches it', () => {
    const open = rewriteOpenCallback(ID, SECRET)
    const back = rewriteBackCallback(ID, SECRET)
    const style = rewriteStyleCallback('price', ID, SECRET)
    expect(open).toBe(`tgp:rw:${ID}:${SECRET}`)
    expect(back).toBe(`tgp:rb:${ID}:${SECRET}`)
    expect(style).toBe(`tgp:re:price:${ID}:${SECRET}`)

    expect(REWRITE_OPEN_RE.exec(String(open))?.slice(1)).toEqual([ID, SECRET])
    expect(REWRITE_BACK_RE.exec(String(back))?.slice(1)).toEqual([ID, SECRET])
    expect(REWRITE_STYLE_RE.exec(String(style))?.slice(1)).toEqual([
      'price',
      ID,
      SECRET,
    ])
  })

  it('the three forms do not match each other', () => {
    /*
     * `tgp:re:` carries one extra field before the id. A style regex loose
     * enough to also match `tgp:rw:` would read the id as a style name and
     * rewrite in a style nobody asked for.
     */
    const open = String(rewriteOpenCallback(ID, SECRET))
    const style = String(rewriteStyleCallback('short', ID, SECRET))
    expect(REWRITE_STYLE_RE.test(open)).toBe(false)
    expect(REWRITE_OPEN_RE.test(style)).toBe(false)
    expect(REWRITE_BACK_RE.test(style)).toBe(false)
    expect(REWRITE_OPEN_RE.test(`tgp:ok:${ID}:${SECRET}`)).toBe(false)
  })

  it('refuses a style it does not have', () => {
    // The style id is spent on the next turn's brief. An unknown one would
    // reach the agent as an empty instruction.
    expect(rewriteStyleCallback('freestyle', ID, SECRET)).toBeNull()
    expect(rewriteStyleById('freestyle')).toBeNull()
    expect(rewriteStyleById('price')?.label).toBe('💰 С ценой')
  })

  it('every style id is short, ASCII and unique', () => {
    const ids = REWRITE_STYLES.map(s => s.id)
    expect(new Set(ids).size, 'two styles share an id').toBe(ids.length)
    for (const s of REWRITE_STYLES) {
      expect(s.id, `${s.id} is not the shape the regex matches`).toMatch(
        /^[a-z]{3,6}$/
      )
      expect(s.note.length, `${s.id} has no brief`).toBeGreaterThan(10)
      expect(s.labelEn, `${s.id} has no English label`).toBeTruthy()
    }
  })
})

describe('the buttons', () => {
  it('fit the 64-byte budget in the worst case the styles allow', () => {
    const longest = REWRITE_STYLES.map(s => s.id).sort(
      (a, b) => b.length - a.length
    )[0]
    const data = String(rewriteStyleCallback(longest, ID, SECRET))
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
  })

  it('are two per row, with the way back on its own', () => {
    const rows = rewriteStyleRows(ID, SECRET, true)
    expect(rows).toHaveLength(Math.ceil(REWRITE_STYLES.length / 2) + 1)
    for (const row of rows.slice(0, -1))
      expect(row.length).toBeLessThanOrEqual(2)
    const last = rows[rows.length - 1]
    expect(last).toHaveLength(1)
    expect(REWRITE_BACK_RE.test(String((last[0] as any).callback_data))).toBe(
      true
    )
  })

  it('speak English when the language is not Russian', () => {
    const ru = rewriteRow(ID, SECRET, true)[0][0] as any
    const en = rewriteRow(ID, SECRET, false)[0][0] as any
    expect(ru.text).toBe('✍️ Переписать')
    expect(en.text).toBe('✍️ Rewrite')
    expect(ru.callback_data).toBe(en.callback_data)
  })

  it('disappear rather than throw when the id will not fit', () => {
    /*
     * The id comes from the render server, not from this repository. A throw
     * here would happen inside `proposalCard` and take down the whole card,
     * including the send button: losing a rewrite button costs a tap, losing
     * the card costs the message.
     */
    const huge = 'x'.repeat(80)
    expect(rewriteOpenCallback(huge, SECRET)).toBeNull()
    expect(rewriteRow(huge, SECRET, true)).toEqual([])
    expect(rewriteStyleRows(huge, SECRET, true)).toEqual([])
    expect(() =>
      cardKeyboard({ id: huge, secret: SECRET }, true, { rewrite: true })
    ).not.toThrow()
  })
})

describe('the brief handed to the next turn', () => {
  it('quotes the rejected draft, because it is nowhere else', () => {
    // It was never sent, so it is not in the correspondence the agent
    // re-reads. Without it "shorter" has nothing to be shorter than.
    const note = rewriteNote(
      rewriteStyleById('short')!,
      'Здравствуйте!  Вот  цена'
    )
    expect(note).toContain('Здравствуйте! Вот цена')
    expect(note).toContain('короче')
  })

  it('caps the quote and survives having nothing to quote', () => {
    const long = 'я'.repeat(1000)
    const note = rewriteNote(rewriteStyleById('soft')!, long)
    expect(note).not.toContain('я'.repeat(301))
    for (const empty of [undefined, null, '', '   ']) {
      const bare = rewriteNote(rewriteStyleById('soft')!, empty)
      expect(bare).toContain('мягче')
      expect(bare, 'an empty draft was quoted as an empty quote').not.toContain(
        '«»'
      )
    }
  })
})

describe('the card in its two states', () => {
  const p = { id: ID, secret: SECRET }

  it('keeps send and cancel first, and gains exactly one button', () => {
    const plain = dataOf(cardKeyboard(p, true) as any)
    const withRewrite = dataOf(cardKeyboard(p, true, { rewrite: true }) as any)
    expect(plain).toEqual([
      [`tgp:ok:${ID}:${SECRET}`, `tgp:no:${ID}:${SECRET}`],
    ])
    expect(withRewrite[0]).toEqual(plain[0])
    expect(withRewrite).toHaveLength(2)
    expect(withRewrite[1]).toEqual([`tgp:rw:${ID}:${SECRET}`])
  })

  it('shows the styles without taking away the answer already offered', () => {
    const open = dataOf(
      cardKeyboard(p, true, { rewrite: true, expanded: true }) as any
    )
    expect(open[0], 'opening the list hid the send button').toEqual([
      `tgp:ok:${ID}:${SECRET}`,
      `tgp:no:${ID}:${SECRET}`,
    ])
    const rest = open.slice(1).flat()
    expect(rest).toHaveLength(REWRITE_STYLES.length + 1)
    expect(rest.filter(d => REWRITE_BACK_RE.test(d))).toHaveLength(1)
  })

  it('offers no rewrite to anybody who was not offered the extra rows', () => {
    // Owner-only, like `extraRows`: the press runs a CRM turn on the owner's
    // own correspondence.
    const rows = dataOf(cardKeyboard(p, true, { expanded: true }) as any)
    expect(rows).toHaveLength(1)
  })

  it('and none on a card with no person behind it', () => {
    /*
     * A rewrite starts a turn that prepares for one numeric person. A draft
     * addressed to a @username has none, so the button would open a list whose
     * every press could only answer that it had nothing to prepare for.
     */
    forgetCardLeadsForTests()
    const named = proposalCard(
      {
        id: ID,
        action: 'send',
        target: '@pilot_client',
        what: 'hi',
        secret: SECRET,
      },
      true,
      { rewrite: true }
    )
    expect(dataOf(named.markup as any)).toHaveLength(1)

    const numeric = proposalCard(
      {
        id: ID,
        action: 'send',
        target: '900000001',
        what: 'hi',
        secret: SECRET,
      },
      true,
      { rewrite: true }
    )
    expect(dataOf(numeric.markup as any)[1]).toEqual([`tgp:rw:${ID}:${SECRET}`])
  })
})

describe('the card remembers the words, not only the person', () => {
  it('hands back the draft once, and the person as often as asked', async () => {
    forgetCardLeadsForTests()
    const { takeCardDraft, peekCardLead } = await import(
      '@/services/telegramProposals'
    )
    rememberCard({
      id: ID,
      target: '900000001',
      what: '  Здравствуйте!\n\nВот  цена  ',
    })
    expect(peekCardLead(ID)).toBe('900000001')
    expect(peekCardLead(ID), 'a peek consumed the entry').toBe('900000001')
    const draft = takeCardDraft(ID)
    expect(draft).toEqual({ lead: '900000001', what: 'Здравствуйте! Вот цена' })
    expect(takeCardDraft(ID), 'the draft was handed out twice').toBeNull()
  })
})
