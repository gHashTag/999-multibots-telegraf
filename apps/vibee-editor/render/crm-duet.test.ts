/**
 * crm_duet -- the seller<->buyer duet loop with doubles for the agent, the
 * buyer model and both sessions. Spec: t27 specs/automation/crm-duet.t27.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  runDuet,
  mediaOf,
  okOf,
  reportOf,
  sellerBrief,
  buyerPersona,
  PAID_TOOLS,
  TURNS_MAX,
  type DuetRun,
  type DuetDeps,
} from './src/agent/crm-duet-tool'
import type { ChatMessage } from './src/agent/chat'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
const BUYER = '435572800'
const ctx = { telegramId: OWNER, pool: {} } as unknown as ToolContext

function freshRun(over: Partial<DuetRun> = {}): DuetRun {
  return {
    id: 'duet-test',
    buyer: BUYER,
    owner: OWNER,
    turns: 2,
    dry_run: false,
    state: 'running',
    started_at: new Date(0).toISOString(),
    transcript: [],
    coverage: {},
    paid_calls: 0,
    media_sent: 0,
    violations: [],
    ...over,
  }
}

type Sent = { from: string; to: string; text?: string; url?: string }

function deps(
  sellerScript: Array<Array<Record<string, unknown>>>,
  buyerScript: string[]
): { d: DuetDeps; sent: Sent[]; histories: ChatMessage[][] } {
  const sent: Sent[] = []
  const histories: ChatMessage[][] = []
  let s = 0
  let b = 0
  const d: DuetDeps = {
    agent: history => {
      histories.push(history.map(m => ({ ...m })))
      const events = sellerScript[s++] ?? []
      return (async function* () {
        for (const e of events) yield e as never
      })()
    },
    buyerModel: async () => buyerScript[b++] ?? '',
    sendText: async (from, to, text) => {
      sent.push({ from: String(from.telegramId), to, text })
    },
    sendMedia: async (from, to, url) => {
      sent.push({ from: String(from.telegramId), to, url })
    },
    now: () => 1000,
  }
  return { d, sent, histories }
}

const text = (t: string) => ({ тип: 'текст', текст: t }) // cyrillic-ok
const result = (name: string, value: unknown, ms = 5) => ({
  тип: 'результат', // cyrillic-ok
  имя: name, // cyrillic-ok
  значение: value, // cyrillic-ok
  мс: ms, // cyrillic-ok
})

describe('crm_duet loop', () => {
  it('seller opens, sides alternate, sends go from the right session to the right person', async () => {
    const { d, sent } = deps(
      [
        [result('pricing', { ok: true }), text('Привет! Показать прайс?')],
        [text('Вот пример поста про 72 плана.')],
      ],
      ['Да, покажите цены.', 'Спасибо, беру пример.']
    )
    const run = await runDuet(freshRun(), ctx, d)
    expect(run.state).toBe('done')
    expect(run.transcript.map(t => t.from)).toEqual([
      'seller',
      'buyer',
      'seller',
      'buyer',
    ])
    expect(sent.map(x => `${x.from}->${x.to}`)).toEqual([
      `${OWNER}->${BUYER}`,
      `${BUYER}->${OWNER}`,
      `${OWNER}->${BUYER}`,
      `${BUYER}->${OWNER}`,
    ])
    expect(run.transcript.every(t => t.sent)).toBe(true)
    expect(run.coverage.pricing).toEqual({ calls: 1, ok: 1, fail: 0 })
    expect(run.paid_calls).toBe(0)
  })

  it('the buyer hears the seller and the seller hears the buyer, with the brief first', async () => {
    const { d, histories } = deps(
      [[text('Здравствуйте.')], [text('Ок.')]],
      ['Кто вы?', 'Ясно.']
    )
    await runDuet(freshRun(), ctx, d)
    expect(histories[0][0].role).toBe('user')
    expect(histories[0][0].content).toContain('Лила Чакра')
    expect(histories[1].at(-1)?.content).toContain(
      'Покупатель (@playom): Кто вы?'
    )
  })

  it('a finished generation is forwarded as media and counted as paid; a failed one is not', async () => {
    const { d, sent } = deps(
      [
        [
          result('image_generate', {
            сделано: true, // cyrillic-ok
            url: 'https://cdn.example/leela.png',
          }), // cyrillic-ok
          result('audio_generate', { сделано: false, причина: 'нет токенов' }), // cyrillic-ok
          text('Картинка для игры готова.'),
        ],
      ],
      ['Красиво.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.paid_calls).toBe(2)
    expect(run.media_sent).toBe(1)
    expect(run.coverage.audio_generate).toEqual({ calls: 1, ok: 0, fail: 1 })
    expect(sent.filter(x => x.url)).toEqual([
      { from: OWNER, to: BUYER, url: 'https://cdn.example/leela.png' },
    ])
    expect(run.transcript[0].media).toEqual(['https://cdn.example/leela.png'])
  })

  it('dry_run keeps everything off Telegram but keeps the transcript', async () => {
    const { d, sent } = deps([[text('Привет.')]], ['Привет.'])
    const run = await runDuet(freshRun({ turns: 1, dry_run: true }), ctx, d)
    expect(sent).toEqual([])
    expect(run.transcript).toHaveLength(2)
    expect(run.transcript.every(t => t.sent === false)).toBe(true)
    expect(reportOf(run)).toContain('dry_run')
  })

  it('a silent seller ends the run without sending an empty message', async () => {
    const { d, sent } = deps([[]], ['…'])
    const run = await runDuet(freshRun({ turns: 2 }), ctx, d)
    expect(run.state).toBe('done')
    expect(run.transcript).toHaveLength(1)
    expect(run.transcript[0].error).toBe('seller produced no text')
    expect(sent).toEqual([])
  })

  it('a send failure marks the run failed with the reason and stops', async () => {
    const { d } = deps([[text('Привет.')]], ['Привет.'])
    d.sendText = async () => {
      throw new Error('FLOOD_WAIT_30')
    }
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.error).toBe('FLOOD_WAIT_30')
    expect(run.transcript[0].sent).toBe(false)
  })

  it('a forbidden tool call is reported as a violation, not hidden', async () => {
    const { d } = deps(
      [[result('tg_send', { ok: true }), text('Отправил.')]],
      ['?']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.violations).toEqual(['turn 0: tg_send'])
    expect(reportOf(run)).toContain('Нарушения брифа')
  })

  it('button markers are stripped from the seller text before it is sent', async () => {
    const { d, sent } = deps([[text('Смотри [[Прайс|pricing]] сюда.')]], ['ок'])
    await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(sent[0].text).toBe('Смотри  сюда.')
  })
})

describe('crm_duet helpers', () => {
  it('mediaOf accepts only a finished generation with an http url', () => {
    const done = { сделано: true, url: 'https://x/y.png' } // cyrillic-ok
    expect(mediaOf(done)).toBe('https://x/y.png')
    expect(mediaOf({ сделано: false, url: 'https://x/y.png' })).toBeNull() // cyrillic-ok
    expect(mediaOf({ сделано: true, url: '/relative.png' })).toBeNull() // cyrillic-ok
    expect(mediaOf({ url: 'https://x/y.png' })).toBeNull()
    expect(mediaOf('https://x/y.png')).toBeNull()
  })

  it('okOf reads the tools\u2019 own failure shapes', () => {
    expect(okOf({ сделано: false })).toBe(false) // cyrillic-ok
    expect(okOf({ ошибка: 'нет ключа' })).toBe(false) // cyrillic-ok
    expect(okOf({ error: 'boom' })).toBe(false)
    expect(okOf({ ok: true })).toBe(true)
    expect(okOf([1, 2])).toBe(true)
  })

  it('the briefs carry the Leela canon and the honesty rules; the paid set has five tools', () => {
    const brief = sellerBrief(BUYER)
    expect(brief).toContain('72 планов')
    expect(brief).toContain('t27.ai/leela')
    expect(brief).toContain('не больше трёх')
    expect(brief).toContain('Не вызывай tg_*')
    expect(buyerPersona()).toContain('@playom')
    expect(PAID_TOOLS.size).toBe(5)
    expect(TURNS_MAX).toBe(8)
  })
})

describe('crm_duet tools', () => {
  it('refuses a non-owner, the owner as buyer, and an unconnected buyer; status without a run says so', async () => {
    vi.resetModules()
    vi.doMock('./src/agent/telegram-tools', () => ({
      requireOwner: (c?: ToolContext) => {
        if (String(c?.telegramId) !== OWNER) throw new Error('only the owner')
      },
      isSeller: async (c?: ToolContext) => String(c?.telegramId) === BUYER,
      withClient: async () => {
        throw new Error('no live client in tests')
      },
    }))
    vi.doMock('./src/agent/tg-proposals', () => ({
      sendWithAddressBook: async () => undefined,
      sendFileWithAddressBook: async () => undefined,
    }))
    const mod = await import('./src/agent/crm-duet-tool')
    const start = mod.CRM_DUET_TOOLS.find(t => t.name === 'crm_duet')!
    const status = mod.CRM_DUET_TOOLS.find(t => t.name === 'crm_duet_status')!
    await expect(
      start.handler({}, { telegramId: BUYER } as unknown as ToolContext)
    ).rejects.toThrow('only the owner')
    await expect(start.handler({ buyer: OWNER }, ctx)).rejects.toThrow(
      'сам владелец'
    )
    await expect(start.handler({ buyer: '999999999' }, ctx)).rejects.toThrow(
      'не подключён'
    )
    await expect(start.handler({ buyer: 'abc' }, ctx)).rejects.toThrow(
      'числовым'
    )
    expect(await status.handler({}, ctx)).toMatchObject({ found: false })
  })
})
