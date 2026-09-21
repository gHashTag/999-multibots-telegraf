import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  startScope,
  noteResolved,
  scopeLine,
  stopScope,
  activeScope,
  resetProactiveForTests,
  resetScopesForTests,
  sweepOnce,
  SWEEP_PROMPT,
  MENU_HOLD_MS,
  type SweepDeps,
} from '@/services/crmProactive'

/**
 * THE SELLER, POINTED AT SOMEBODY -- THE QUEUE.
 *
 * One person, one card, the owner's button, the next person. Idle and
 * failed items move on by themselves; a press on some other card frees the
 * hold but skips nobody; three failures stop the walk.
 */
const OWNER = '144022504'
const item = (chat: string, next: string | null = null) => ({
  chat,
  display: null,
  next,
})
const card = (id: string) => ({
  текст: 'подготовил', // cyrillic-ok: pre-existing identifiers
  инструменты: ['crm_lead_context'], // cyrillic-ok: pre-existing identifiers
  proposal: { id, action: 'send', target: '@x', what: 'x', secret: 's' },
})
const idle = () => ({ текст: 'тихо', инструменты: ['crm_lead_context'] }) // cyrillic-ok: pre-existing identifiers
const noTools = () => ({ текст: '?', инструменты: [] }) // cyrillic-ok: pre-existing identifiers
const flush = () => new Promise(r => setTimeout(r, 15))

function deps(answerFor: (n: number) => unknown) {
  let n = 0
  const calls: string[] = []
  const asks: string[] = []
  const labels: string[] = []
  const d: SweepDeps = {
    ask: async (_o, text) => {
      asks.push(text)
      return answerFor(n++) as never
    },
    ingest: async () => {
      calls.push('ingest')
    },
    push: async () => {
      calls.push('push')
    },
    record: async (_o, turns) => {
      labels.push(String(turns[0]?.content ?? ''))
      return 'recorded'
    },
  }
  return { d, calls, asks, labels }
}
const sayer = () => {
  const said: string[] = []
  return { said, say: async (t: string) => void said.push(t) }
}

beforeEach(() => {
  resetProactiveForTests()
  resetScopesForTests()
})

describe('sweepOnce options', () => {
  it('uses the given brief, skips the ingest when told, records the label, and names the card', async () => {
    const { d, calls, asks, labels } = deps(() => card('p1'))
    const r = await sweepOnce(OWNER, d, {
      prompt: 'X',
      ingest: false,
      label: '[кнопка]',
    })
    expect(asks).toEqual(['X'])
    expect(calls).toEqual(['push'])
    await flush()
    expect(labels).toEqual(['[кнопка]'])
    expect(r).toMatchObject({ did: 'card', id: 'p1' })
  })

  it('without options it is the generic sweep', async () => {
    const { d, calls, asks } = deps(() => idle())
    await sweepOnce(OWNER, d)
    expect(asks).toEqual([SWEEP_PROMPT])
    expect(calls).toEqual(['ingest'])
  })
})

/*
 * THE SWEEP SAYS WHOSE FACE IT DRAWS (owner, 2026-09-21: "the client's face is
 * mandatory"). The render learned the client of a turn only on its own
 * client-thread route; the sweeps -- where the CRM cards are made -- never
 * said, so a picture drawn in them without a file was the OWNER's avatar.
 */
describe('a scoped turn names its lead to the render; the generic one names nobody', () => {
  function faceDeps(answer: () => unknown = idle) {
    const faces: Array<string | null> = []
    const d: SweepDeps = {
      ask: async (_o, _text, o) => {
        faces.push(o?.faceOf ?? null)
        return answer() as never
      },
      ingest: async () => undefined,
      push: async () => undefined,
    }
    return { d, faces }
  }

  it('a numeric item carries its own id as the face; an @username carries none', async () => {
    const { d, faces } = faceDeps()
    const { say } = sayer()
    await startScope(OWNER, 'f', [item('900000241'), item('@pilot')], d, say)
    await flush()
    expect(faces).toEqual(['900000241', null])
  })

  it('the generic sweep draws for nobody in particular', async () => {
    const { d, faces } = faceDeps()
    await sweepOnce(OWNER, d)
    expect(faces).toEqual([null])
  })

  it('an explicit face travels through both attempts of one sweep', async () => {
    const { d, faces } = faceDeps(noTools)
    await sweepOnce(OWNER, d, { prompt: 'X', faceOf: '900000242' })
    // The no-tools answer is asked once more, for the same person.
    expect(faces).toEqual(['900000242', '900000242'])
  })
})

describe('the queue', () => {
  it('asks for the second person only after the press on the first card; a foreign press skips nobody', async () => {
    const { d, asks, calls } = deps(n => card(`p${n + 1}`))
    const { said, say } = sayer()
    const line = await startScope(
      OWNER,
      'x',
      [item('@a', 'talk'), item('@b')],
      d,
      say
    )
    expect(line).toContain('2 чел.')
    await flush()
    expect(asks).toHaveLength(1)
    expect(asks[0]).toContain('ОДИН человек — @a')
    expect(asks[0]).toContain('crm_leads НЕ вызывай')
    expect(asks[0]).toContain('next=talk')
    expect(said[0]).toBe('1 из 2 · @a · поговорить')
    expect(scopeLine(OWNER)).toContain('жду кнопку')
    noteResolved(OWNER, 'somebody-elses-card')
    await flush()
    expect(asks).toHaveLength(1)
    noteResolved(OWNER, 'p1')
    await flush()
    expect(asks).toHaveLength(2)
    expect(asks[1]).toContain('ОДИН человек — @b')
    // The memory was refreshed once, for the first person only.
    expect(calls.filter(c => c === 'ingest')).toHaveLength(1)
    noteResolved(OWNER, 'p2')
    await flush()
    expect(activeScope(OWNER)).toBeNull()
    expect(said.at(-1)).toContain('завершён: карточек 2')
  })

  it('idle items move on by themselves and are said', async () => {
    const { d, asks } = deps(() => idle())
    const { said, say } = sayer()
    await startScope(OWNER, 'y', [item('@a'), item('@b')], d, say)
    await flush()
    expect(asks).toHaveLength(2)
    expect(said.filter(s => s.startsWith('тихо'))).toHaveLength(2)
    expect(activeScope(OWNER)).toBeNull()
  })

  it('three failures in a row stop the walk and say so', async () => {
    const { d, asks } = deps(() => noTools())
    const { said, say } = sayer()
    await startScope(
      OWNER,
      'z',
      [item('@a'), item('@b'), item('@c'), item('@d')],
      d,
      say
    )
    await flush()
    // Three items, each asked twice: a no-tools answer earns one retry with
    // the rule spelled out before the item counts as failed.
    expect(asks).toHaveLength(6)
    expect(said.some(s => s.includes('три раза подряд'))).toBe(true)
    expect(activeScope(OWNER)).toBeNull()
  })

  it('a card that already hangs holds the first item; the press on it resumes', async () => {
    const generic = deps(() => card('old'))
    await sweepOnce(OWNER, generic.d)
    const { d, asks } = deps(() => card('p1'))
    const { said, say } = sayer()
    await startScope(OWNER, 'w', [item('@a')], d, say)
    await flush()
    expect(asks).toHaveLength(0)
    expect(said.some(s => s.includes('нажми на ней'))).toBe(true)
    expect(scopeLine(OWNER)).toContain('жду прошлую карточку')
    noteResolved(OWNER, 'old')
    await flush()
    expect(asks).toHaveLength(1)
    expect(activeScope(OWNER)?.cursor).toBe(0)
  })

  it('stop, status, replace', async () => {
    const { d } = deps(() => card('p1'))
    const { said, say } = sayer()
    expect(scopeLine(OWNER)).toBeNull()
    expect(stopScope(OWNER)).toBe('Обхода нет.')
    await startScope(OWNER, 'first', [item('@a'), item('@b')], d, say)
    await flush()
    await startScope(OWNER, 'second', [item('@c')], d, say)
    expect(said.some(s => s.includes('Прошлый обход «first»'))).toBe(true)
    expect(activeScope(OWNER)?.label).toBe('second')
    expect(stopScope(OWNER)).toContain('«second» остановлен на 1 из 1')
    expect(activeScope(OWNER)).toBeNull()
  })

  it('an empty selection starts nothing', async () => {
    const { d, asks } = deps(() => card('p1'))
    const { say } = sayer()
    expect(await startScope(OWNER, 'e', [], d, say)).toBe('Никого не выбрано.')
    await flush()
    expect(asks).toHaveLength(0)
    expect(activeScope(OWNER)).toBeNull()
  })

  it('the press-made hold is ten minutes, not two hours', () => {
    expect(MENU_HOLD_MS).toBe(10 * 60_000)
  })
})
