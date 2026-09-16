import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  sweepOnce,
  pushCard,
  noteResolved,
  resetProactiveForTests,
  SWEEP_PROMPT,
  HOLD_MS_DEFAULT,
  type SweepDeps,
} from '@/services/crmProactive'

/**
 * The seller that works without being asked -- and the four ways that could
 * go wrong: sending by itself, evicting a card nobody pressed, running twice
 * at once, and dying on the first hiccup.
 */
const OWNER = '144022504'
const draft = {
  id: 'p1',
  action: 'send',
  target: '555',
  what: 'привет',
  secret: 's',
}

function deps(over: Partial<SweepDeps> & { answer?: unknown } = {}) {
  const calls: string[] = []
  const d: SweepDeps = {
    ask: async () => {
      calls.push('ask')
      return (over.answer ?? { текст: 'подготовил', proposal: draft }) as never // cyrillic-ok: pre-existing identifiers
    },
    ingest: async () => {
      calls.push('ingest')
    },
    push: async () => {
      calls.push('push')
    },
    record: async () => {
      calls.push('record')
      return 'recorded'
    },
    now: () => 1_000_000,
    ...over,
  }
  return { d, calls }
}

beforeEach(() => resetProactiveForTests())

describe('one sweep', () => {
  it('a proposal becomes a card in the owner chat, and the turn is written down', async () => {
    const pushed: unknown[] = []
    const recorded: unknown[] = []
    const { d } = deps({
      push: async (owner, dr) => {
        pushed.push([owner, dr])
      },
      record: async (owner, turns) => {
        recorded.push([owner, turns])
        return 'recorded'
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(pushed).toEqual([[OWNER, draft]])
    await new Promise(res => setTimeout(res, 0))
    expect(recorded.length).toBe(1)
    const [, turns] = recorded[0] as [
      string,
      Array<{ role: string; content: string }>,
    ]
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant'])
    expect(turns[1].content).toBe('подготовил')
  })

  it('memory first, then the turn: ingest runs before ask', async () => {
    const { d, calls } = deps()
    await sweepOnce(OWNER, d)
    expect(calls.slice(0, 2)).toEqual(['ingest', 'ask'])
  })

  it('no proposal is a quiet sweep: nothing is pushed', async () => {
    // The fixture now carries the tool the brief opens with, because a REAL
    // quiet sweep called it -- that is what makes "quiet" a finding rather
    // than an absence. Written without it, this case was indistinguishable
    // from a model that never looked.
    const { d, calls } = deps({
      answer: { текст: 'тихо', инструменты: ['crm_leads'] }, // cyrillic-ok: pre-existing identifiers
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('idle')
    expect(calls).not.toContain('push')
  })

  it('a sweep that called NOTHING did not look, and is not idle', async () => {
    /*
     * Measured in production on 2026-09-08: the model returned fifteen
     * characters, `[[Подпись|can]]`, with zero tool calls, and the sweep
     * recorded `did: idle, why: [[Подпись|can]]`. From the outside that reads
     * as "the seller looked and decided to wait". Nobody looked.
     */
    const { d, calls } = deps({
      answer: { текст: '[[Подпись|can]]', инструменты: [] }, // cyrillic-ok: pre-existing identifiers
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('failed')
    expect(r.why).toContain('[[Подпись|can]]')
    expect(calls).not.toContain('push')
  })

  it('an empty answer with no tools is also a failure, and says so', async () => {
    const { d } = deps({ answer: { текст: '', инструменты: [] } }) // cyrillic-ok: pre-existing identifiers
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('failed')
  })

  it('a failing ingest does not silence the person who is waiting', async () => {
    const { d, calls } = deps({
      ingest: async () => {
        throw new Error('FLOOD_WAIT_120')
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(calls).toContain('push')
  })

  it('a failing agent is a failed sweep, and the next sweep still runs', async () => {
    const { d } = deps({
      ask: async () => {
        throw new Error('render 502')
      },
    })
    expect((await sweepOnce(OWNER, d)).did).toBe('failed')
    const ok = deps()
    expect((await sweepOnce(OWNER, ok.d)).did).toBe('card')
  })
})

describe('a card nobody pressed is not evicted', () => {
  it('holds the next sweep, and a press frees it', async () => {
    const { d, calls } = deps()
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    const held = await sweepOnce(OWNER, d)
    expect(held.did).toBe('held')
    expect(
      calls.filter(c => c === 'ask').length,
      'the agent was asked while a card waited'
    ).toBe(1)
    // The owner is named: the hold belongs to a person now, and a press
    // carries who pressed. Freeing every owner's hold on an anonymous press
    // is the shared-state behaviour this replaced.
    noteResolved(OWNER)
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    expect(calls.filter(c => c === 'ask').length).toBe(2)
  })

  /**
   * ADMIN_IDS NAMES FIVE PEOPLE IN PRODUCTION.
   *
   * Each of them passes requireAdmin, so each can run /sweep, and the render
   * gates every CRM tool by the caller's identity -- so each gets cards about
   * their OWN correspondence. The hold behind those cards was one module
   * variable: an unpressed card of one admin held all the others for two
   * hours, and the message they got named a card they can neither see nor
   * press.
   */
  it("one admin's unpressed card does not hold another admin", async () => {
    const a = deps()
    const b = deps()
    expect((await sweepOnce(OWNER, a.d)).did).toBe('card')
    expect(
      (await sweepOnce('900000042', b.d)).did,
      'the second admin was held by a card that is not his'
    ).toBe('card')
    // And his own card holds him, exactly as before.
    expect((await sweepOnce('900000042', b.d)).did).toBe('held')
    // Freeing one does not free the other.
    noteResolved('900000042')
    expect((await sweepOnce(OWNER, a.d)).did).toBe('held')
    expect((await sweepOnce('900000042', b.d)).did).toBe('card')
  })

  it('the hold expires by itself', async () => {
    let t = 1_000_000
    const { d } = deps({ now: () => t })
    await sweepOnce(OWNER, d)
    t += HOLD_MS_DEFAULT + 1
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })
})

describe('never two at once', () => {
  it('a sweep started while one runs is busy, not a second turn', async () => {
    let release: (v: unknown) => void = () => {}
    const { d, calls } = deps({
      ask: async () => {
        calls.push('ask')
        await new Promise(res => {
          release = res
        })
        // carries the tool the brief opens with: this case is about
        // concurrency, not about a model that failed to look
        return { текст: 'тихо', инструменты: ['crm_leads'] } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const first = sweepOnce(OWNER, d)
    await new Promise(res => setTimeout(res, 0))
    const second = await sweepOnce(OWNER, d)
    expect(second.did).toBe('busy')
    release(null)
    expect((await first).did).toBe('idle')
    expect(calls.filter(c => c === 'ask').length).toBe(1)
  })

  it("but another admin's sweep is not busy because of it", async () => {
    // The five admins in ADMIN_IDS have five separate correspondences. One
    // turn in flight used to answer "busy" to all the others, so a second
    // admin could not sweep at all while the first was thinking.
    let release: (v: unknown) => void = () => {}
    const a = deps({
      ask: async () => {
        await new Promise(res => {
          release = res
        })
        return { текст: 'тихо', инструменты: ['crm_leads'] } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const b = deps()
    const first = sweepOnce(OWNER, a.d)
    await new Promise(res => setTimeout(res, 0))
    expect(
      (await sweepOnce('900000042', b.d)).did,
      'a turn for one admin blocked every other admin'
    ).toBe('card')
    release(null)
    expect((await first).did).toBe('idle')
  })
})

describe('the brief', () => {
  it('asks for memory, at most one action, and forbids sending', () => {
    expect(SWEEP_PROMPT).toContain('crm_leads')
    expect(SWEEP_PROMPT).toContain('crm_lead_context')
    expect(SWEEP_PROMPT).toContain('ОДНО')
    expect(SWEEP_PROMPT).toContain('НИЧЕГО НЕ ОТПРАВЛЯЙ')
    // The owner: the client must want to buy by themselves.
    expect(SWEEP_PROMPT).toContain('next=talk')
    expect(SWEEP_PROMPT).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ')
    expect(SWEEP_PROMPT).toContain('САМ спрашивал цену')
  })
})

describe('the card in the owner chat', () => {
  const tg = (photoFails = false) => {
    const sent: Array<[string, ...unknown[]]> = []
    return {
      sent,
      sendMessage: async (chat: string, text: string, extra?: unknown) => {
        sent.push(['message', chat, text, extra])
      },
      sendPhoto: async (chat: string, photo: string, extra?: unknown) => {
        if (photoFails) throw new Error('wrong file identifier')
        sent.push(['photo', chat, photo, extra])
      },
    }
  }
  it('a text draft is a message with the two buttons', async () => {
    const t = tg()
    await pushCard(t, OWNER, draft as never)
    expect(t.sent[0][0]).toBe('message')
    expect(t.sent[0][1]).toBe(OWNER)
    expect(String(t.sent[0][2])).toContain('привет')
    const data = (t.sent[0][3] as any).reply_markup.inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toEqual([`tgp:ok:p1:s`, `tgp:no:p1:s`])
  })
  it('a photo draft is a photo with the caption and the same buttons', async () => {
    const t = tg()
    await pushCard(t, OWNER, {
      ...draft,
      media: { kind: 'photo', url: 'https://s3/x.png' },
      charge: { telegramId: '555', op: 'image_generate', tokens: 2 },
    } as never)
    expect(t.sent[0][0]).toBe('photo')
    expect(t.sent[0][2]).toBe('https://s3/x.png')
    const extra = t.sent[0][3] as any
    expect(String(extra.caption)).toContain('Спишется у получателя: 2')
    expect(extra.reply_markup.inline_keyboard.flat().length).toBe(2)
  })
  it('a photo that cannot be shown becomes a message with the link', async () => {
    const t = tg(true)
    await pushCard(t, OWNER, {
      ...draft,
      media: { kind: 'photo', url: 'https://s3/x.png' },
    } as never)
    expect(t.sent[0][0]).toBe('message')
    expect(String(t.sent[0][2])).toContain('https://s3/x.png')
  })
})

describe('wired (source-level: the bot is not booted here)', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')
  it('both presses free the next sweep', () => {
    const s = read('navigation/registerCommands.ts')
    const ok = s.indexOf('bot.action(/^tgp:ok:')
    const no = s.indexOf('bot.action(/^tgp:no:')
    expect(ok).toBeGreaterThan(-1)
    expect(no).toBeGreaterThan(-1)
    // The press names the owner and the card, so a scoped sweep can advance.
    expect(s.slice(ok, no)).toMatch(
      /noteResolved\(String\(ctx\.from\?\.id \?\? ''\), id\)/
    )
    expect(s.slice(no, no + 1800)).toMatch(
      /noteResolved\(String\(ctx\.from\?\.id \?\? ''\), id\)/
    )
  })
  it('the ENTRY THAT RUNS starts the sweep unless CRM_PROACTIVE_MINUTES is zero', () => {
    // src/index.ts is what Railway starts; src/bot.ts has its own initializer
    // and is not it. The first wiring sat in bot.ts for an hour doing nothing.
    const s = read('index.ts')
    expect(s.indexOf('startCrmProactive(carrier')).toBeGreaterThan(
      s.indexOf('await initializeBots()')
    )
    expect(s).toContain("process.env.CRM_PROACTIVE_MINUTES ?? '30'")
    expect(s).toMatch(/if \(proactiveMinutes > 0/)
    expect(s).toContain('startCrmProactive(carrier')
  })
})

/**
 * ONE LOOP PER OWNER -- MEASURED IN PRODUCTION, NOT IMAGINED.
 *
 * Both src/bot.ts and src/index.ts call startCrmProactive, and the Railway
 * logs show exactly two sweeps per tick, to the second, tick after tick:
 *
 *   2  2026-09-15 23:01:33
 *   2  2026-09-15 23:30:00
 *   2  2026-09-16 00:00:00
 *
 * Harmless while both are held by the same unpressed card. Not harmless the
 * moment the hold expires with the model free: two turns for one person, two
 * cards in one second, twice the spend.
 */
describe('the proactive loop is claimed, not doubled', () => {
  it('a second start for the same owner returns the first loop', async () => {
    const m = await import('@/services/crmProactive')
    m.resetProactiveLoopsForTests()
    const bot = { botInfo: { username: 'b' }, telegram: {} } as never
    const ticks: number[] = []
    const stopA = m.startCrmProactive(bot, {
      ownerId: '144022504',
      everyMs: 60_000,
      firstDelayMs: 10_000_000,
    })
    const stopB = m.startCrmProactive(bot, {
      ownerId: '144022504',
      everyMs: 60_000,
      firstDelayMs: 10_000_000,
    })
    expect(stopB, 'a second timer was started for the same owner').toBe(stopA)
    expect(ticks).toEqual([])
    stopA()
    // And after stopping, the owner can be started again -- a stop is a stop,
    // not a permanent claim.
    const stopC = m.startCrmProactive(bot, {
      ownerId: '144022504',
      everyMs: 60_000,
      firstDelayMs: 10_000_000,
    })
    expect(stopC).not.toBe(stopA)
    stopC()
    m.resetProactiveLoopsForTests()
  })

  it('another owner gets their own loop', async () => {
    const m = await import('@/services/crmProactive')
    m.resetProactiveLoopsForTests()
    const bot = { botInfo: { username: 'b' }, telegram: {} } as never
    const a = m.startCrmProactive(bot, {
      ownerId: '144022504',
      everyMs: 60_000,
      firstDelayMs: 10_000_000,
    })
    const b = m.startCrmProactive(bot, {
      ownerId: '900000042',
      everyMs: 60_000,
      firstDelayMs: 10_000_000,
    })
    expect(b, 'two owners were handed the same loop').not.toBe(a)
    m.resetProactiveLoopsForTests()
  })
})
