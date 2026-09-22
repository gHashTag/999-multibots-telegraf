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
      'https://render.example.com/api/browser/journal?limit=6'
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
