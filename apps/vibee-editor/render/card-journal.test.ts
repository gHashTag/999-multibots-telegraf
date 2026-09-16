import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  remember,
  claim,
  forgetProposals,
  onOrphaned,
} from './src/agent/tg-proposals'
import {
  wireCardJournal,
  unwireCardJournal,
  noteCardDropped,
} from './src/agent/card-journal'

/**
 * 62 PREPARED, 5 SENT, 57 NOWHERE.
 *
 * Measured from the hive journal 2026-09-16. The queue keeps one draft per
 * person, so each new card replaces the previous -- and the previous left no
 * trace at all, because the only listener cared about invoices and pictures
 * and the ordinary card is plain text.
 *
 * These pin the line that makes the funnel countable, and pin just as hard
 * what must NOT be in it: the client, the text, the target.
 */
const OWNER = '144022504'

const draft = (id: string, who = OWNER, what = 'привет') => ({
  id,
  telegramId: who,
  action: 'send' as const,
  target: '900000002',
  what,
})

describe('a card that leaves unsent leaves a line', () => {
  let rows: Array<Record<string, unknown>>
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*(CREATE|ALTER)/i.test(sql)) return { rows: [] }
      if (/INSERT INTO hive_events/i.test(sql)) {
        rows.push({
          kind: params[0],
          who: params[1],
          what: params[4],
          severity: params[5],
        })
      }
      return { rows: [] }
    },
  }

  beforeEach(() => {
    rows = []
    forgetProposals()
    unwireCardJournal()
    onOrphaned(null)
    wireCardJournal(() => pool)
  })
  afterEach(() => {
    onOrphaned(null)
    unwireCardJournal()
  })

  const settle = () => new Promise(r => setTimeout(r, 0))

  it('a PLAIN TEXT card that is replaced is written down', async () => {
    // The whole point: no invoice, no picture. This is the card the seller
    // makes eleven times a day, and it used to vanish.
    remember(draft('old'))
    remember(draft('new'))
    await settle()
    expect(rows, 'a replaced text card left no trace').toHaveLength(1)
    expect(rows[0].kind).toBe('card-dropped')
    expect(rows[0].who).toBe(OWNER)
    expect(String(rows[0].what)).toContain('replaced')
  })

  it('a cancelled card is written down with its own reason', async () => {
    const kept = remember(draft('c1'))
    claim(OWNER, 'c1', kept.secret, 'cancel')
    await settle()
    expect(rows).toHaveLength(1)
    expect(String(rows[0].what)).toContain('cancelled')
  })

  it('a card that was SENT leaves no drop line', async () => {
    // Only the ones that never reached anybody are the funnel's business.
    const kept = remember(draft('s1'))
    expect(claim(OWNER, 's1', kept.secret).ok).toBe(true)
    await settle()
    expect(rows, 'a sent card was counted as lost').toHaveLength(0)
  })

  it('the line carries the owner and the reason, and NOT the client', async () => {
    remember(draft('old', OWNER, 'секретный текст для клиента')) // cyrillic-ok
    remember(draft('new'))
    await settle()
    const line = JSON.stringify(rows[0])
    expect(line).not.toContain('секретный текст') // cyrillic-ok
    expect(line, 'the target must not travel into the journal').not.toContain(
      '900000002'
    )
    expect(rows[0].severity, 'a funnel line is not an alarm').toBe('normal')
  })

  it('a database that refuses does not throw at the press', async () => {
    const angry = {
      query: async () => {
        throw new Error('disk full')
      },
    }
    await expect(
      noteCardDropped(() => angry, draft('x') as never, 'replaced')
    ).resolves.toBe('not recorded')
  })

  it('wiring twice registers one listener, not two', async () => {
    wireCardJournal(() => pool)
    wireCardJournal(() => pool)
    remember(draft('old'))
    remember(draft('new'))
    await settle()
    expect(rows, 'one drop wrote two lines').toHaveLength(1)
  })
})
