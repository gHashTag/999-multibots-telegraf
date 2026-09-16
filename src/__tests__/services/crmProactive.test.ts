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
    // A press carries the person who pressed -- a Telegram callback always
    // does. It used to be optional here because the hold was one variable for
    // the whole process; now it names whose hold to free, and an anonymous
    // press deliberately frees nobody rather than everybody.
    noteResolved(OWNER)
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    expect(calls.filter(c => c === 'ask').length).toBe(2)
  })

  it('the hold expires by itself', async () => {
    let t = 1_000_000
    const { d } = deps({ now: () => t })
    await sweepOnce(OWNER, d)
    t += HOLD_MS_DEFAULT + 1
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })

  /*
   * THE TIMER IS SHORTER THAN THE CARD.
   *
   * The backoff starts at two hours; a draft is pressable for twelve. So the
   * sweep came back while the card was still on the owner's screen, drew a
   * second one, and the queue evicted the first -- together with the picture
   * that had already been generated for it. Production, 16.09.2026: four such
   * evictions in a day, each a picture bought and never sent.
   */
  it('a card still alive holds the sweep after the timer has run out', async () => {
    let t = 1_000_000
    const alive = { ...draft, expiresAt: t + 12 * 60 * 60_000 }
    const { d, calls } = deps({
      now: () => t,
      answer: { текст: 'подготовил', proposal: alive }, // cyrillic-ok: pre-existing identifiers
    })
    expect((await sweepOnce(OWNER, d)).did).toBe('card')

    t += HOLD_MS_DEFAULT + 1
    const held = await sweepOnce(OWNER, d)
    expect(held.did).toBe('held')
    expect(held.why).toContain('оплаченной картинкой')
    expect(
      calls.filter(c => c === 'ask').length,
      'the agent was asked while a pressable card was still waiting'
    ).toBe(1)

    // And the hold is the CARD, not a second timer: once it can no longer be
    // pressed there is nothing to evict, so the seller goes back to work.
    t = alive.expiresAt + 1
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })

  it('a press frees it long before the card would have died', async () => {
    let t = 1_000_000
    const alive = { ...draft, expiresAt: t + 12 * 60 * 60_000 }
    const { d } = deps({
      now: () => t,
      answer: { текст: 'подготовил', proposal: alive }, // cyrillic-ok: pre-existing identifiers
    })
    await sweepOnce(OWNER, d)
    noteResolved(OWNER)
    t += 1
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })

  /*
   * A CARD THAT DOES NOT SAY WHEN IT DIES LEAVES THE GUARD OFF.
   *
   * The instant comes over the wire from the render. An older render sends
   * none, and inventing one here would hold a seller for twelve hours on a
   * number nobody reported -- the expensive direction of a wrong guess.
   */
  it('without the instant, the old timer still rules', async () => {
    let t = 1_000_000
    const { d } = deps({ now: () => t })
    await sweepOnce(OWNER, d)
    t += HOLD_MS_DEFAULT + 1
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
  })
})

/*
 * PLACED BEFORE A NEIGHBOUR RATHER THAN APPENDED AT THE END OF THE FILE.
 *
 * The end of a file is a shared anchor: three branches that each append their
 * describe there conflict with one another over nothing. A merge rehearsal on
 * 17.09.2026 found it twice in this very file. An insertion point is as much
 * an interface between branches as a function name.
 */
/*
 * A CARD NOBODY PRESSED IS AN ANSWER OF A KIND.
 *
 * Production 16.09.2026: 56 cards over four and a half days went to ten
 * people, three of whom took thirty-seven. Not a targeting defect -- those
 * three write daily and sit at the top of the work queue on every tick, so
 * the owner was shown the same three faces again and again and pressed none.
 *
 * Step 2 of the brief is "take the FIRST whose next is not wait", so the
 * ORDER of the candidate lines is the choice. Moving somebody already offered
 * to the end of that list is the whole mechanism.
 */
describe('somebody already offered goes to the back of the list', () => {
  const A = '900000011'
  const B = '900000022'
  const rows = [
    { lead: A, display: 'первый', next: 'deliver' },
    { lead: B, display: 'второй', next: 'reply' },
  ]

  it('without a cold set the note is exactly what it always was', () => {
    expect(leadsNote(rows, new Set())).toBe(leadsNote(rows))
  })

  it('a cold lead is listed last and named as already offered', () => {
    const note = leadsNote(rows, new Set([A]))
    expect(note.indexOf(B)).toBeLessThan(note.indexOf(A))
    expect(note).toContain('её не нажали')
    // and the fresh one carries no such mark
    const freshLine = note.split('\n').find(l => l.includes(B)) ?? ''
    expect(freshLine).not.toContain('не нажали')
  })

  /*
   * IF EVERYBODY HAS BEEN OFFERED, NOTHING CHANGES.
   *
   * Silence about every candidate is not a reason to go quiet -- that would
   * turn a quiet week into a dead seller.
   */
  it('when all candidates are cold the order is untouched', () => {
    const note = leadsNote(rows, new Set([A, B]))
    expect(note.indexOf(A)).toBeLessThan(note.indexOf(B))
  })

  /*
   * CHECKED THROUGH THE BRIEF, NOT THROUGH A TEST HATCH.
   *
   * The brief is what the model actually reads, so asserting on it proves the
   * mechanism end to end. A getter for the internal map would have proved
   * only that the map was written.
   */
  it('after a card, the next brief puts that person last; a press undoes it', async () => {
    const texts: string[] = []
    let t = 1_000_000
    const { d } = deps({
      now: () => t,
      leads: async () => rows,
      ask: async (_o, text) => {
        texts.push(text)
        return {
          текст: 'подготовил', // cyrillic-ok: pre-existing identifiers
          proposal: { ...draft, lead: A, target: A },
        } as never
      },
    })
    expect((await sweepOnce(OWNER, d)).did).toBe('card')
    expect(texts[0].indexOf(A), 'первый обход уже кого-то двигал').toBeLessThan(
      texts[0].indexOf(B)
    )

    // Second tick, no press in between: the person just offered goes last.
    t += HOLD_MS_DEFAULT + 1
    await sweepOnce(OWNER, d)
    expect(texts[1], 'второй обход предложил того же первым').toContain(
      'её не нажали'
    )
    expect(texts[1].indexOf(B)).toBeLessThan(texts[1].indexOf(A))

    // A press about that card makes the person eligible again at once.
    noteResolved(OWNER, String(draft.id))
    t += HOLD_MS_DEFAULT + 1
    await sweepOnce(OWNER, d)
    expect(texts[2].indexOf(A)).toBeLessThan(texts[2].indexOf(B))
  })

  it('a day later the person comes back on their own', async () => {
    const texts: string[] = []
    let t = 1_000_000
    const { d } = deps({
      now: () => t,
      leads: async () => rows,
      ask: async (_o, text) => {
        texts.push(text)
        return {
          текст: 'подготовил', // cyrillic-ok: pre-existing identifiers
          proposal: { ...draft, lead: A, target: A },
        } as never
      },
    })
    await sweepOnce(OWNER, d)
    t += 24 * 60 * 60_000 + 1
    await sweepOnce(OWNER, d)
    expect(
      texts[1].indexOf(A),
      'через сутки человек так и не вернулся в начало'
    ).toBeLessThan(texts[1].indexOf(B))
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
})
