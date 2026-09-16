import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  sweepOnce,
  pushCard,
  noteResolved,
  resetProactiveForTests,
  SWEEP_PROMPT,
  SWEEP_RETRY_NOTE,
  SWEEP_RETRY_NOTE_LOOKED,
  leadsNote,
  HOLD_MS_DEFAULT,
  holdFor,
  BACKOFF_CAP_MS,
  reportSweepOutcome,
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

  it('a no-tools answer gets exactly one retry that names the missing call', async () => {
    /*
     * Production 2026-09-09, 11:54-15:04: `[[Подпись|no_one_available]]`
     * with zero tools, seven sweeps in a row. The second turn carries the
     * rule spelled out; a model that then calls crm_leads and says quiet is
     * a real idle.
     */
    const prompts: string[] = []
    let n = 0
    const { d, calls } = deps({
      ask: async (_o, text) => {
        prompts.push(text)
        n += 1
        return (
          n === 1
            ? { текст: '[[Подпись|no_one_available]]', инструменты: [] } // cyrillic-ok: pre-existing identifiers
            : { текст: 'тихо', инструменты: ['crm_leads'] }
        ) as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('idle')
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toBe(SWEEP_PROMPT)
    expect(prompts[1]).toBe(SWEEP_PROMPT + SWEEP_RETRY_NOTE)
    expect(prompts[1]).toContain('crm_leads')
    // The junk first answer is not written into the shared transcript.
    expect(calls.filter(c => c === 'record')).toHaveLength(1)
  })

  it('two no-tools answers in a row are a failure, and nothing is recorded', async () => {
    let n = 0
    const { d, calls } = deps({
      ask: async () => {
        n += 1
        return { текст: '[[Подпись|reply]]', инструменты: [] } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('failed')
    expect(n).toBe(2)
    expect(calls).not.toContain('record')
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

describe('the sweep looks first, then asks', () => {
  /*
   * Production 2026-09-09 22:14: both turns were `[[Подпись|crm_leads]]` --
   * the tool's name written instead of called -- and the sweep was filed as
   * failed with nobody knowing whether anyone was waiting. Step 1 is a plain
   * MCP call; the sweep makes it itself.
   */
  const waiting = { lead: '555', display: 'Анна', next: 'reply' }
  const quiet = { lead: '777', display: 'Борис', next: 'wait' }

  it('nobody due: a real idle, and the model is not even asked', async () => {
    const { d, calls } = deps({ leads: async () => [quiet] })
    const r = await sweepOnce(OWNER, d)
    expect(r).toEqual({
      did: 'idle',
      why: 'crm_leads: 1 кандидат(ов), все next=wait',
    })
    expect(calls).not.toContain('ask')
  })

  it('an empty list is idle too, and says so', async () => {
    const { d, calls } = deps({ leads: async () => [] })
    const r = await sweepOnce(OWNER, d)
    expect(r).toEqual({ did: 'idle', why: 'crm_leads: кандидатов нет' })
    expect(calls).not.toContain('ask')
  })

  it('somebody due: the rows go into the brief and step 1 is marked done', async () => {
    const texts: string[] = []
    const { d } = deps({
      leads: async () => [quiet, waiting],
      ask: async (_o, text) => {
        texts.push(text)
        return { текст: 'подготовил', proposal: draft } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(texts[0]).toContain(SWEEP_PROMPT)
    expect(texts[0]).toContain(leadsNote([quiet, waiting]))
    expect(texts[0]).toContain('Анна (555): next=reply')
    expect(texts[0]).toContain('ШАГ 1 УЖЕ ВЫПОЛНЕН')
  })

  it('somebody due and two no-tools answers: failed, naming who waits; the retry note skips step 1', async () => {
    const texts: string[] = []
    const { d } = deps({
      leads: async () => [waiting],
      ask: async (_o, text) => {
        texts.push(text)
        return { текст: '[[Подпись|crm_leads]]', инструменты: [] } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('failed')
    expect(r.why).toContain('ждёт Анна (next=reply)')
    expect(texts).toHaveLength(2)
    expect(texts[1]).toContain(SWEEP_RETRY_NOTE_LOOKED)
    expect(texts[1]).not.toContain(SWEEP_RETRY_NOTE)
  })

  it('a failing crm_leads falls back to the model looking, as before', async () => {
    const texts: string[] = []
    const { d } = deps({
      leads: async () => {
        throw new Error('render 502')
      },
      ask: async (_o, text) => {
        texts.push(text)
        return { текст: 'тихо', инструменты: ['crm_leads'] } as never // cyrillic-ok: pre-existing identifiers
      },
    })
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('idle')
    expect(texts[0]).toBe(SWEEP_PROMPT)
  })

  it('a scoped brief (its own prompt) does not read crm_leads', async () => {
    let fetched = 0
    const { d } = deps({
      leads: async () => {
        fetched += 1
        return []
      },
      answer: { текст: 'тихо', инструменты: ['crm_lead_context'] }, // cyrillic-ok: pre-existing identifiers
    })
    const r = await sweepOnce(OWNER, d, { prompt: 'scoped brief' })
    expect(r.did).toBe('idle')
    expect(fetched).toBe(0)
  })

  it('wired: the live deps fetch the rows through the render MCP', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/crmProactive.ts'),
      'utf8'
    )
    expect(src).toContain('leads: owner => fetchLeadRows(owner, LOOK_LIMIT)')
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
    // The press names WHOSE card it was. Without an owner it frees nobody:
    // one seller's press used to clear the hold for every seller at once.
    noteResolved(OWNER)
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    expect(calls.filter(c => c === 'ask').length).toBe(2)
  })

  it('waits longer each time nobody presses, and a press resets it', async () => {
    /*
     * MEASURED FROM THE HIVE JOURNAL 2026-09-16: 62 cards over five and a
     * half days against five `written` touches in the whole log. One draft
     * per person means each card REPLACES the last unpressed one, so eleven
     * a day is eleven thrown away -- each costing an ingest and two model
     * calls to produce.
     */
    let t = 1_000_000
    const { d, calls } = deps({ now: () => t })
    const step = async () => (await sweepOnce(OWNER, d)).did

    // Three cards at the plain two-hour hold: nothing has gone wrong yet.
    expect(await step()).toBe('card')
    t += HOLD_MS_DEFAULT + 1
    expect(await step()).toBe('card')
    t += HOLD_MS_DEFAULT + 1
    expect(await step()).toBe('card')

    // The fourth is where it slows down: two hours is no longer enough.
    t += HOLD_MS_DEFAULT + 1
    expect(await step(), 'a fourth unpressed card at the same pace').toBe(
      'held'
    )
    t += HOLD_MS_DEFAULT
    expect(await step(), 'four hours should be').toBe('card')

    /*
     * A press puts it back to the first step -- and the proof has to look
     * PAST the press itself. `noteResolved` also clears the hold, so the
     * very next sweep succeeds whether the counter was reset or not; the
     * question is what happens to the one AFTER it. Proven by mutation:
     * without this second step, deleting the reset left the test green.
     */
    noteResolved(OWNER)
    t += 1
    expect(await step()).toBe('card')
    t += HOLD_MS_DEFAULT + 1
    expect(
      await step(),
      'the press did not end the backoff -- the counter kept climbing'
    ).toBe('card')
  })

  it('the backoff is capped, and the steps are the ones written down', () => {
    expect(holdFor(0)).toBe(HOLD_MS_DEFAULT)
    expect(holdFor(2)).toBe(HOLD_MS_DEFAULT)
    expect(holdFor(3)).toBe(HOLD_MS_DEFAULT * 2)
    expect(holdFor(4)).toBe(HOLD_MS_DEFAULT * 4)
    expect(holdFor(99), 'an unread owner must not be silenced forever').toBe(
      BACKOFF_CAP_MS
    )
  })

  it('somebody who ASKED for a sweep is never backed off', async () => {
    // /sweep and the queue name their own hold. Backing off a person who
    // just asked would be a bug in the clothes of a feature.
    let t = 1_000_000
    const { d } = deps({ now: () => t })
    for (let i = 0; i < 5; i += 1) {
      t += HOLD_MS_DEFAULT + 1
      await sweepOnce(OWNER, d)
    }
    t += 60_000
    expect((await sweepOnce(OWNER, d, { holdMs: 0 })).did).toBe('card')
  })

  it("one seller's card does not hold another seller", async () => {
    /*
     * MEASURED IN PRODUCTION 2026-09-16: crm_sellers returns two sellers, one
     * of whom does not own this deployment. `lastPushAt` lived at module
     * scope, so after ONE of them got a card, the other's sweep answered
     * `held` -- "the card is still waiting for the owner's press" -- about
     * somebody else's card, for the whole two-hour hold. The second seller
     * could not be sold for at all.
     */
    const { d, calls } = deps()
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    const other = await sweepOnce('9000000042', d)
    expect(other.did, "another seller's card held this one").toBe('card')
    expect(calls.filter(c => c === 'ask').length).toBe(2)
  })

  it("and a press by one seller does not free the other's hold", async () => {
    const { d } = deps()
    await sweepOnce(OWNER, d)
    await sweepOnce('9000000042', d)
    noteResolved('9000000042')
    expect(
      (await sweepOnce(OWNER, d)).did,
      "somebody else's press let this card be replaced before it was seen"
    ).toBe('held')
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
    // 2026-09-12: the clock moved to the Inngest cron crm-proactive-sweep;
    // the entry registers the carrier for it and keeps the timer behind
    // CRM_SWEEP_DRIVER=timer.
    const s = read('index.ts')
    expect(s.indexOf('setCrmCarrier(carrier')).toBeGreaterThan(
      s.indexOf('await initializeBots()')
    )
    expect(s).toContain("process.env.CRM_PROACTIVE_MINUTES ?? '30'")
    expect(s).toMatch(/if \(proactiveMinutes > 0/)
    expect(s).toContain('setCrmCarrier(carrier')
    expect(s).toMatch(
      /if \(driver === 'timer'\) \{\s*startCrmProactive\(carrier/
    )
  })
})

describe('alerting on failed sweeps', () => {
  it('first failure and every sixth are errors, the rest warnings, recovery once', () => {
    const levels: string[] = []
    for (let i = 0; i < 7; i++)
      levels.push(reportSweepOutcome({ did: 'failed', why: 'x' }))
    expect(levels).toEqual([
      'error',
      'warn',
      'warn',
      'warn',
      'warn',
      'error',
      'warn',
    ])
    expect(reportSweepOutcome({ did: 'idle', why: 'тихо' })).toBe('info')
    // The streak is over: the next failure is fresh news again.
    expect(reportSweepOutcome({ did: 'failed', why: 'y' })).toBe('error')
  })

  it('the line says WHOSE sweep it was', async () => {
    /*
     * PRODUCTION, 2026-09-16 07:02:19 -- two lines in the same second:
     *
     *   [crm-proactive] sweep {"did":"card","why":"…"}
     *   [crm-proactive] sweep {"did":"held","why":"карточка ещё ждёт нажатия"}
     *
     * With two sellers that reads two ways: one held behind the OTHER one's
     * card, or one seller swept twice by the two drivers and correctly held
     * the second time. Without the owner on the line nobody can tell, and
     * the evidence for a live bug is unusable.
     */
    const { logger } = await import('@/utils/logger')
    const seen: Array<Record<string, unknown>> = []
    const spy = vi.spyOn(logger, 'info').mockImplementation(((
      _m: string,
      meta: Record<string, unknown>
    ) => {
      seen.push(meta ?? {})
    }) as never)
    try {
      reportSweepOutcome({ did: 'held', why: 'карточка ждёт' }, '9000000042')
    } finally {
      spy.mockRestore()
    }
    expect(seen.some(m => m.owner === '9000000042')).toBe(true)
  })

  it('wired: the tick actually hands the owner over', () => {
    /*
     * Proven necessary by mutation: with only the direct call tested above,
     * deleting the argument at the CALL SITE left every test green -- the
     * function would keep taking an owner that nobody ever gave it, which is
     * the shape of four separate bugs this repository has already paid for.
     */
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/services/crmProactive.ts'),
      'utf8'
    )
    expect(src).toMatch(/reportSweepOutcome\(r,\s*owner\)/)
  })

  it('an outcome with no owner still gets logged, without guessing one', () => {
    // A guessed owner would be worse than none: it would name the wrong
    // person on somebody else's failure.
    expect(reportSweepOutcome({ did: 'idle', why: 'тихо' })).toBe('info')
  })
})
