/**
 * AUTOPILOT: THE OWNER'S PRESS, GIVEN IN ADVANCE — AND ITS FOUR LIMITS.
 *
 * Owner, 2026-09-23: a button that sends without waiting for his tap, because
 * the sweep had been returning `held` for every owner while a client waited
 * nine days. What is pinned here is not that it sends — that is one line —
 * but that it stops: it expires, it has a daily cap, an unanswerable database
 * means OFF, and a stop pressed here survives a database that then goes away.
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  autopilotState,
  takeAutopilotSend,
  turnAutopilotOn,
  turnAutopilotOff,
  setAutopilotDbForTests,
  forgetAutopilotMemoryForTests,
  AUTOPILOT_DAILY_CAP,
  AUTOPILOT_TAKE,
  AUTOPILOT_READ,
  AUTOPILOT_ON,
  AUTOPILOT_OFF,
  AUTOPILOT_LEAD_ADD,
  AUTOPILOT_LEAD_REMOVE,
  AUTOPILOT_LEAD_LIST,
  chooseAutopilotLead,
} from '@/services/crmAutopilot'

const OWNER = '900000091'

/**
 * A database double that runs the module's own SQL in the head, so a change
 * to a statement has to be a change to the behaviour described here.
 */
function fakeDb() {
  const rows = new Map<
    string,
    { until: number; day: string; sent_today: number; scope: string }
  >()
  /** `${owner}:${lead}` for everybody the owner picked (crm_autopilot_leads). */
  const chosen = new Set<string>()
  const today = () => new Date().toISOString().slice(0, 10)
  let down = false
  const db = {
    calls: [] as string[],
    goDown: () => {
      down = true
    },
    seed: (
      owner: string,
      r: { until: number; day?: string; sent?: number; scope?: string }
    ) =>
      rows.set(owner, {
        until: r.until,
        day: r.day ?? today(),
        sent_today: r.sent ?? 0,
        scope: r.scope ?? 'all',
      }),
    pick: (owner: string, lead: string) => chosen.add(`${owner}:${lead}`),
    chosenCount: () => chosen.size,
    peek: (owner: string) => rows.get(owner),
    async query(sql: string, params: unknown[] = []) {
      db.calls.push(sql.slice(0, 24))
      if (down) throw new Error('database is not answering')
      if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE'))
        return { rows: [] }
      const owner = String(params[0] ?? '')
      if (sql === AUTOPILOT_READ) {
        const r = rows.get(owner)
        return {
          rows: r
            ? [
                {
                  until: new Date(r.until).toISOString(),
                  day: r.day,
                  sent_today: r.sent_today,
                  scope: r.scope,
                },
              ]
            : [],
        }
      }
      if (sql === AUTOPILOT_LEAD_ADD) {
        chosen.add(`${owner}:${String(params[1] ?? '')}`)
        return { rows: [] }
      }
      if (sql === AUTOPILOT_LEAD_REMOVE) {
        chosen.delete(`${owner}:${String(params[1] ?? '')}`)
        return { rows: [] }
      }
      if (sql === AUTOPILOT_LEAD_LIST) {
        return {
          rows: [...chosen]
            .filter(k => k.startsWith(`${owner}:`))
            .map(k => ({ lead_id: k.split(':')[1] })),
        }
      }
      if (sql === AUTOPILOT_ON) {
        const hours = Number(params[1] ?? 0)
        const until = Date.now() + hours * 3_600_000
        const scope = String(params[2] ?? 'all')
        rows.set(owner, { until, day: today(), sent_today: 0, scope })
        return { rows: [{ until: new Date(until).toISOString(), scope }] }
      }
      if (sql === AUTOPILOT_OFF) {
        const r = rows.get(owner)
        if (!r) return { rows: [] }
        r.until = Date.now() - 1_000
        return { rows: [{ owner_id: owner }] }
      }
      if (sql === AUTOPILOT_TAKE) {
        const cap = Number(params[1] ?? 0)
        const lead = String(params[2] ?? '')
        const r = rows.get(owner)
        if (!r || r.until <= Date.now()) return { rows: [] }
        const fresh = r.day !== today()
        if (!fresh && r.sent_today >= cap) return { rows: [] }
        // The same condition the statement carries: with `chosen`, the person
        // must be on the list -- and an unnamed lead is nobody.
        if (r.scope === 'chosen' && !chosen.has(`${owner}:${lead}`))
          return { rows: [] }
        r.day = today()
        r.sent_today = fresh ? 1 : r.sent_today + 1
        return { rows: [{ sent_today: r.sent_today }] }
      }
      throw new Error(`unexpected sql: ${sql.slice(0, 40)}`)
    },
  }
  return db
}

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  db = fakeDb()
  forgetAutopilotMemoryForTests()
  setAutopilotDbForTests(db)
})

afterEach(() => {
  setAutopilotDbForTests(null)
  forgetAutopilotMemoryForTests()
})

describe('the switch', () => {
  it('is off until it is pressed, and a card waits', async () => {
    expect(await autopilotState(OWNER)).toMatchObject({ on: false })
    expect(await takeAutopilotSend(OWNER)).toBe(false)
  })

  it('opens a window and authorises sends inside it', async () => {
    const until = await turnAutopilotOn(OWNER, 8)
    expect(until).toBeInstanceOf(Date)
    expect(until!.getTime()).toBeGreaterThan(Date.now())

    const st = await autopilotState(OWNER)
    expect(st.on).toBe(true)
    expect(st.left).toBe(AUTOPILOT_DAILY_CAP)
    expect(await takeAutopilotSend(OWNER)).toBe(true)
  })

  it('expires by itself: an old window authorises nothing', async () => {
    db.seed(OWNER, { until: Date.now() - 60_000 })
    expect(await autopilotState(OWNER)).toMatchObject({ on: false })
    expect(await takeAutopilotSend(OWNER)).toBe(false)
  })
})

describe("today's cap", () => {
  it('spends and then refuses, so a loop gone wrong is bounded', async () => {
    await turnAutopilotOn(OWNER, 8)
    for (let i = 0; i < AUTOPILOT_DAILY_CAP; i++)
      expect(await takeAutopilotSend(OWNER)).toBe(true)
    expect(await takeAutopilotSend(OWNER)).toBe(false)
    expect((await autopilotState(OWNER)).left).toBe(0)
  })

  it('rolls over to a new day without the old count holding it shut', async () => {
    db.seed(OWNER, {
      until: Date.now() + 3_600_000,
      day: '2000-01-01',
      sent: AUTOPILOT_DAILY_CAP,
    })
    expect(await takeAutopilotSend(OWNER)).toBe(true)
    expect(db.peek(OWNER)!.sent_today).toBe(1)
  })

  it('takes the budget in ONE statement, so two sweeps cannot both spend the last one', async () => {
    db.seed(OWNER, {
      until: Date.now() + 3_600_000,
      sent: AUTOPILOT_DAILY_CAP - 1,
    })
    const [a, b] = await Promise.all([
      takeAutopilotSend(OWNER),
      takeAutopilotSend(OWNER),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(db.peek(OWNER)!.sent_today).toBe(AUTOPILOT_DAILY_CAP)
  })
})

describe('only the people he picked', () => {
  const HIM = '900000093'
  const SOMEBODY_ELSE = '900000094'

  it('with scope=chosen, an unpicked person gets no automatic send', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    expect(await takeAutopilotSend(OWNER, SOMEBODY_ELSE)).toBe(false)
    // And the budget was NOT spent on the refusal.
    expect((await autopilotState(OWNER)).left).toBe(AUTOPILOT_DAILY_CAP)
  })

  it('a picked person does, and the budget is spent on them', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    expect(await chooseAutopilotLead(OWNER, HIM, true)).toBe(true)
    expect(await takeAutopilotSend(OWNER, HIM)).toBe(true)
    expect((await autopilotState(OWNER)).left).toBe(AUTOPILOT_DAILY_CAP - 1)
  })

  it('unpicking stops it again', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    await chooseAutopilotLead(OWNER, HIM, true)
    await chooseAutopilotLead(OWNER, HIM, false)
    expect(await takeAutopilotSend(OWNER, HIM)).toBe(false)
  })

  it('a card with no recipient named is nobody, so it waits', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    await chooseAutopilotLead(OWNER, HIM, true)
    expect(await takeAutopilotSend(OWNER)).toBe(false)
    expect(await takeAutopilotSend(OWNER, '')).toBe(false)
  })

  it('scope=all is unchanged: anybody the sweep drew a card for', async () => {
    await turnAutopilotOn(OWNER, 8)
    expect(await takeAutopilotSend(OWNER, SOMEBODY_ELSE)).toBe(true)
  })

  it('the state says which scope is on and how many are picked', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    await chooseAutopilotLead(OWNER, HIM, true)
    const st = await autopilotState(OWNER)
    expect(st).toMatchObject({ on: true, scope: 'chosen', chosen: 1 })
  })

  it('chosen with NOBODY picked sends nothing -- and says so as 0', async () => {
    await turnAutopilotOn(OWNER, 8, 'chosen')
    const st = await autopilotState(OWNER)
    expect(st.chosen).toBe(0)
    expect(await takeAutopilotSend(OWNER, HIM)).toBe(false)
  })
})

describe('when the database cannot answer', () => {
  it('autopilot is OFF: silence never authorises a send from his account', async () => {
    await turnAutopilotOn(OWNER, 8)
    db.goDown()
    expect(await takeAutopilotSend(OWNER)).toBe(false)
    expect(await autopilotState(OWNER)).toMatchObject({
      on: false,
      unknown: true,
    })
  })

  it('a stop pressed here holds even if the write never lands', async () => {
    await turnAutopilotOn(OWNER, 8)
    db.goDown()
    expect(await turnAutopilotOff(OWNER)).toBe(false)
    expect(await takeAutopilotSend(OWNER)).toBe(false)
  })

  it('and it stays off when the database comes back and still says "on"', async () => {
    await turnAutopilotOn(OWNER, 8)
    await turnAutopilotOff(OWNER)
    // The row is expired by OFF; a fresh process would read it as off too.
    expect(db.peek(OWNER)!.until).toBeLessThan(Date.now() + 1)
    expect(await takeAutopilotSend(OWNER)).toBe(false)
  })
})

describe('no other owner is touched', () => {
  it('one owner switching on does not authorise another', async () => {
    await turnAutopilotOn(OWNER, 8)
    expect(await takeAutopilotSend('900000092')).toBe(false)
  })
})

/**
 * THE WIRING: `pushCard` is the one place a proactive card reaches the owner,
 * so it is the one place the switch is read.
 */
describe('a card under autopilot', () => {
  const draft = {
    id: 'p1',
    secret: 's',
    target: '900000093',
    display: 'Клиент', // cyrillic-ok: a fictional display name
    what: 'привет, вот идея', // cyrillic-ok: the draft's words
  }
  const tg = () => {
    const sent: any[] = []
    return {
      sent,
      sendMessage: async (c: string, t: string, e?: unknown) => {
        sent.push(['message', c, t, e])
      },
      sendPhoto: async (c: string, p: string, e?: unknown) => {
        sent.push(['photo', c, p, e])
      },
    }
  }
  const dataOf = (extra: any) =>
    (extra?.reply_markup?.inline_keyboard ?? [])
      .flat()
      .map((b: any) => b.callback_data)
      .filter(Boolean)

  it('goes out by itself, and the owner gets a receipt he can stop', async () => {
    const { pushCard } = await import('@/services/crmProactive')
    const proposals = await import('@/services/telegramProposals')
    const confirmed: string[] = []
    const spy = vi
      .spyOn(proposals, 'confirmProposal')
      .mockImplementation(async (_o: string, id: string) => {
        confirmed.push(id)
        return { ok: true } as never
      })
    await turnAutopilotOn(OWNER, 8)
    const t = tg()
    await pushCard(t as never, OWNER, draft as never)

    expect(confirmed).toEqual(['p1'])
    expect(t.sent).toHaveLength(1)
    const [kind, chat, text, extra] = t.sent[0]
    expect(kind).toBe('message')
    expect(chat).toBe(OWNER)
    // A receipt: who it went to and what was said.
    expect(String(text)).toContain('Клиент') // cyrillic-ok: the fictional name
    expect(String(text)).toContain('привет, вот идея') // cyrillic-ok: the words
    // No send/cancel pair — there is nothing left to decide — and the stop is
    // in this very message.
    expect(dataOf(extra)).toContain('crm:autooff')
    expect(dataOf(extra).some((d: string) => d.startsWith('tgp:'))).toBe(false)
    // The budget was spent.
    expect((await autopilotState(OWNER)).left).toBe(AUTOPILOT_DAILY_CAP - 1)
    spy.mockRestore()
  })

  it('a send that failed falls through to the card, so the words are not lost', async () => {
    const { pushCard } = await import('@/services/crmProactive')
    const proposals = await import('@/services/telegramProposals')
    const spy = vi
      .spyOn(proposals, 'confirmProposal')
      .mockResolvedValue({ ok: false, error: 'провайдер отказал' } as never) // cyrillic-ok: a provider's words
    await turnAutopilotOn(OWNER, 8)
    const t = tg()
    await pushCard(t as never, OWNER, draft as never)

    expect(t.sent).toHaveLength(1)
    expect(dataOf(t.sent[0][3])).toContain('tgp:ok:p1:s')
    spy.mockRestore()
  })

  it('a send whose outcome is unknown offers NO second send', async () => {
    const { pushCard } = await import('@/services/crmProactive')
    const proposals = await import('@/services/telegramProposals')
    const spy = vi
      .spyOn(proposals, 'confirmProposal')
      .mockResolvedValue({ ok: false, unknown: true } as never)
    await turnAutopilotOn(OWNER, 8)
    const t = tg()
    await pushCard(t as never, OWNER, draft as never)

    expect(t.sent).toHaveLength(1)
    const [, , text, extra] = t.sent[0]
    expect(String(text)).toContain('связь прервалась') // cyrillic-ok: the line
    expect(dataOf(extra).some((d: string) => d.startsWith('tgp:'))).toBe(false)
    spy.mockRestore()
  })

  it('with the switch off the card is exactly what it was, plus the switch', async () => {
    const { pushCard } = await import('@/services/crmProactive')
    const proposals = await import('@/services/telegramProposals')
    const spy = vi.spyOn(proposals, 'confirmProposal')
    const t = tg()
    await pushCard(t as never, OWNER, draft as never)

    expect(spy).not.toHaveBeenCalled()
    expect(dataOf(t.sent[0][3])).toEqual([
      'tgp:ok:p1:s',
      'tgp:no:p1:s',
      'crm:auto',
    ])
    spy.mockRestore()
  })
})
