import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))
vi.mock('../config', () => ({ API_BASE: 'https://render.example.com' }))

beforeEach(() => apiFetch.mockReset())

const dict: Record<string, string> = {
  'browser.journal.verb.screenshot': 'посмотрел',
  'browser.journal.verb.type': 'напечатал',
  'browser.journal.pending': 'описание готовится',
  'browser.journal.chars': 'симв.',
}
const t = (k: string) => dict[k] ?? k
const step = (tool: string, detail: Record<string, unknown>, ok = true) => ({
  at: '2026-09-22T09:00:05Z',
  tool,
  ok,
  ms: 1,
  detail,
})

describe('journalLine', () => {
  it('says the step through the dictionary', async () => {
    const { journalLine } = await import('./browserJournal')
    expect(
      journalLine(step('browser_screenshot', { seen: 'Google sign-in' }), t)
    ).toMatchObject({
      verb: 'посмотрел',
      text: 'Google sign-in',
      ok: true,
    })
    expect(journalLine(step('browser_type', { chars: 15 }), t).text).toBe(
      '15 симв.'
    )
    expect(
      journalLine(step('browser_screenshot', { seenPending: true }), t).text
    ).toBe('описание готовится')
  })

  it('an unknown tool keeps its own name; a failed step leads with its error', async () => {
    const { journalLine } = await import('./browserJournal')
    expect(journalLine(step('browser_future', {}), t).verb).toBe(
      'browser_future'
    )
    const failed = journalLine(
      step('browser_click', { x: 1, y: 2, error: 'taken the wheel' }, false),
      t
    )
    expect(failed).toMatchObject({ ok: false, text: 'taken the wheel' })
    expect(journalLine(step('browser_status', { pages: 5 }), t).time).toMatch(
      /^\d\d:\d\d:\d\d$/
    )
  })
})

describe('readBrowserJournal', () => {
  it('reads the steps, and gives null instead of throwing', async () => {
    const { readBrowserJournal } = await import('./browserJournal')
    apiFetch.mockResolvedValue({
      ok: true,
      steps: [step('browser_status', { pages: 1 })],
    })
    expect(await readBrowserJournal()).toHaveLength(1)
    expect(apiFetch.mock.calls[0][0]).toBe(
      'https://render.example.com/api/browser/journal?limit=24'
    )
    apiFetch.mockRejectedValue(Object.assign(new Error('no'), { status: 401 }))
    expect(await readBrowserJournal()).toBeNull()
    apiFetch.mockResolvedValue({ ok: true })
    expect(await readBrowserJournal()).toBeNull()
  })
})

describe('the dictionary', () => {
  it('has every journal key in both languages', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const src = readFileSync(
      path.resolve(__dirname, '../atoms/language.ts'),
      'utf8'
    )
    const keys = [
      'browser.journal',
      'browser.journal.pending',
      'browser.journal.chars',
      ...[
        'open',
        'read',
        'screenshot',
        'click',
        'type',
        'evaluate',
        'status',
        'close_tab',
        'ask_permission',
      ].map(v => `browser.journal.verb.${v}`),
    ]
    for (const k of keys) expect(src.split(`'${k}':`).length - 1).toBe(2)
  })
})

describe('foldRepeats', () => {
  const at = (s: number) => `2026-09-22T09:00:${String(s).padStart(2, '0')}Z`
  const look = (s: number, seen = 'Google sign-in', ok = true) => ({
    at: at(s),
    tool: 'browser_screenshot',
    ok,
    ms: 1,
    detail: ok ? { seen } : { error: 'down' },
  })

  it('folds the same step in a row into one line with a count, newest time kept', async () => {
    const { foldRepeats } = await import('./browserJournal')
    const folded = foldRepeats(
      [
        look(9),
        look(8),
        look(7),
        step('browser_open', { url: 'https://t27.ai/' }),
      ],
      t
    )
    expect(folded.map(s => [s.tool, s.times])).toEqual([
      ['browser_screenshot', 3],
      ['browser_open', 1],
    ])
    expect(folded[0].at).toBe(at(9))
  })

  it('does not fold different facts, a failure, or steps apart', async () => {
    const { foldRepeats } = await import('./browserJournal')
    expect(
      foldRepeats([look(9), look(8, 'Other page')], t).map(s => s.times)
    ).toEqual([1, 1])
    expect(
      foldRepeats([look(9), look(8, 'x', false), look(7)], t).map(s => s.times)
    ).toEqual([1, 1, 1])
  })

  it('still shows up to the limit of distinct lines after folding', async () => {
    const { foldRepeats, JOURNAL_SHOWN } = await import('./browserJournal')
    const many = Array.from({ length: 30 }, (_, i) =>
      step('browser_open', { url: `https://site${i}.example/` })
    )
    expect(foldRepeats(many, t)).toHaveLength(JOURNAL_SHOWN)
  })
})
