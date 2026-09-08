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
    const { d, calls } = deps({ answer: { текст: 'тихо' } }) // cyrillic-ok: pre-existing identifiers
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('idle')
    expect(calls).not.toContain('push')
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
    noteResolved()
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
        return { текст: 'тихо' } as never // cyrillic-ok: pre-existing identifiers
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
    expect(s.slice(ok, no)).toContain('noteResolved()')
    expect(s.slice(no, no + 1500)).toContain('noteResolved()')
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
