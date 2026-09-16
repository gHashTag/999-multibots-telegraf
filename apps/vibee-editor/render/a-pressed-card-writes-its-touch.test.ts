import { describe, it, expect } from 'vitest'
import { leadOfTarget, leadOfTargetIn } from './src/agent/telegram-tools'

/*
 * THE FIVE ON THE BOARD WAS PART BOOKKEEPING.
 *
 * `p.lead` decides, in tg-proposals, whether a confirmed send records a
 * `written` touch at all -- and the board counts sends by counting those
 * touches. A @username yields no lead, so pressing such a card sent the
 * message and wrote nothing.
 *
 * Measured 2026-09-16: the board said five sends in total, and the card
 * waiting for a press at that moment was addressed by @username. Pressing it
 * would not have moved the five. For seven cycles that number was reported as
 * a leak between preparing a card and pressing it.
 *
 * Ids here are synthetic (9000000xx): no real person is named in this tree.
 */
const OWNER = '144022504'
const OTHER_OWNER = '900000001'

const ctx = (rows: any[], owner = OWNER) =>
  ({
    telegramId: owner,
    pool: {
      query: async (sql: string, params?: unknown[]) => {
        // The scoping is the point, so the double answers only its own owner.
        const flat = String(sql).replace(/\s+/g, ' ')
        expect(flat, 'the lookup must be scoped by owner').toMatch(
          /owner_id = \$1/
        )
        const [askedOwner, askedName] = (params ?? []) as string[]
        return {
          rows: rows.filter(
            r =>
              String(r.owner) === String(askedOwner) &&
              String(r.username).toLowerCase() ===
                String(askedName).toLowerCase()
          ),
        }
      },
    },
  }) as never

const KNOWN = [
  { owner: OWNER, username: 'client_one', lead_id: '900000042' },
  { owner: OTHER_OWNER, username: 'not_yours', lead_id: '900000099' },
]

describe('a numeric target is unchanged', () => {
  it('still resolves without touching the database', async () => {
    expect(leadOfTarget('900000042')).toBe('900000042')
    await expect(leadOfTargetIn(undefined, '900000042')).resolves.toBe(
      '900000042'
    )
  })

  it('and a @username is still not a lead on its own', () => {
    expect(leadOfTarget('@client_one')).toBeUndefined()
  })
})

describe('a @username the owner has corresponded with becomes a lead', () => {
  it('resolves through crm_people, with or without the @', async () => {
    await expect(leadOfTargetIn(ctx(KNOWN), '@client_one')).resolves.toBe(
      '900000042'
    )
    await expect(leadOfTargetIn(ctx(KNOWN), 'client_one')).resolves.toBe(
      '900000042'
    )
  })

  it('matches the case Telegram does not preserve', async () => {
    await expect(leadOfTargetIn(ctx(KNOWN), '@Client_One')).resolves.toBe(
      '900000042'
    )
  })
})

describe('what it refuses to guess', () => {
  it("another owner's contact does not answer this owner's question", async () => {
    await expect(
      leadOfTargetIn(ctx(KNOWN), '@not_yours')
    ).resolves.toBeUndefined()
  })

  it('two people under one username resolve to nobody', async () => {
    const twice = [
      { owner: OWNER, username: 'renamed', lead_id: '900000043' },
      { owner: OWNER, username: 'renamed', lead_id: '900000044' },
    ]
    await expect(
      leadOfTargetIn(ctx(twice), '@renamed')
    ).resolves.toBeUndefined()
  })

  it('a username nobody has seen resolves to nobody', async () => {
    await expect(
      leadOfTargetIn(ctx(KNOWN), '@stranger_x')
    ).resolves.toBeUndefined()
  })

  it('a row whose lead_id is not a Telegram id is not believed', async () => {
    const junk = [{ owner: OWNER, username: 'odd_one', lead_id: 'not-an-id' }]
    await expect(leadOfTargetIn(ctx(junk), '@odd_one')).resolves.toBeUndefined()
  })
})

describe('a card that cannot look up its lead is still a card', () => {
  it('no pool: undefined, never a throw', async () => {
    await expect(
      leadOfTargetIn({ telegramId: OWNER } as never, '@client_one')
    ).resolves.toBeUndefined()
  })

  it('no owner: undefined, and the query is never asked', async () => {
    let asked = false
    const anon = {
      pool: {
        query: async () => {
          asked = true
          return { rows: [] }
        },
      },
    } as never
    await expect(leadOfTargetIn(anon, '@client_one')).resolves.toBeUndefined()
    expect(asked, 'an unscoped lookup must not be sent at all').toBe(false)
  })

  it('a database that throws does not take the send down with it', async () => {
    const broken = {
      telegramId: OWNER,
      pool: {
        query: async () => {
          throw new Error('connection terminated')
        },
      },
    } as never
    await expect(leadOfTargetIn(broken, '@client_one')).resolves.toBeUndefined()
  })
})
