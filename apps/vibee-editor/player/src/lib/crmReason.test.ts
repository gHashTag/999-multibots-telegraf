import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { translations, type Language } from '@/atoms/language'
import { reasonLine, toWaiting } from './crm'

/*
 * WHY SOMEBODY IS WAITING, IN THE SCREEN'S LANGUAGE.
 *
 * The render server wrote every reason as Russian prose, and an English
 * screen printed it verbatim (loop tick 12). It now sends a code next to the
 * words. Pinned here: a known code is translated with its numbers, anything
 * else shows the server's words, and every code the server can send has a
 * line in both dictionaries.
 */

const tr =
  (lang: Language) => (key: string, vars?: Record<string, string | number>) => {
    const line = translations[lang][key] || key
    return vars
      ? line.replace(/\{(\w+)\}/g, (w, n) => (n in vars ? String(vars[n]) : w))
      : line
  }
const en = tr('en')

describe('reasonLine', () => {
  it('translates a known code, with its numbers', () => {
    expect(reasonLine(en, 'we_wrote_days', { days: 9 }, 'words')).toBe(
      'we wrote 9 d ago, no answer'
    )
    expect(reasonLine(en, 'they_replied', null, 'words')).toBe(
      'they replied, we are silent'
    )
  })

  it('shows the words for a code this screen does not know yet', () => {
    // A server newer than the player: its words are at least true, while
    // the bare key "crm.why.new_code" says nothing.
    expect(reasonLine(en, 'new_code', null, 'words')).toBe('words')
  })

  it('shows the words when an older server sends no code', () => {
    expect(reasonLine(en, null, null, 'words')).toBe('words')
  })
})

/*
 * The codes are read from the server's own source, not copied here: a copy
 * is the list that knows a rule the other two files do not.
 */
// A plain path: `new URL(template, import.meta.url)` is read by Vite as an
// asset glob over the whole directory, and refused outside the player.
const AGENT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../render/src/agent'
)
const serverSource = (file: string) =>
  readFileSync(resolve(AGENT, file), 'utf8')

function codesOf(file: string, type: string): string[] {
  const src = serverSource(file)
  const body = src.split(`export type ${type} =`)[1]?.split(/\n\n/)[0] ?? ''
  return [...body.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

const placeholders = (line: string) =>
  [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('every reason the server can send has a line', () => {
  const codes = [
    ...codesOf('crm-stages.ts', 'WaitWhy'),
    ...codesOf('sales-playbook.ts', 'NextWhy'),
  ]
  const sentVars = new Set(
    [...serverSource('sales-playbook.ts').matchAll(/whyVars: \{ (\w+):/g)].map(
      m => m[1]
    )
  )

  it('finds the codes at all', () => {
    // A parse that silently finds nothing would pass every check below.
    expect(codes.length).toBeGreaterThanOrEqual(18)
  })

  it.each(codes)('%s: in English and in Russian, with the same numbers', c => {
    const e = translations.en[`crm.why.${c}`]
    const r = translations.ru[`crm.why.${c}`]
    expect(e, 'en').toBeTruthy()
    expect(r, 'ru').toBeTruthy()
    expect(placeholders(e)).toEqual(placeholders(r))
    // A placeholder the server never fills would show "{n}" on a phone.
    for (const p of placeholders(e)) expect(sentVars).toContain(p)
  })
})

describe('the waiting list keeps the codes it was sent', () => {
  const one = (x: Record<string, unknown>) =>
    toWaiting({ waiting: [{ telegram_id: '1', because: 'w', ...x }] })
      .waiting[0]

  it('reads both codes and the numbers', () => {
    const r = one({
      because_code: 'we_wrote',
      next_why_code: 'we_wrote_days',
      next_why_vars: { days: 9, what: 'x', junk: { a: 1 } },
    })
    expect(r.becauseCode).toBe('we_wrote')
    expect(r.nextWhyCode).toBe('we_wrote_days')
    // Only what a line can print: an object would show "[object Object]".
    expect(r.nextWhyVars).toEqual({ days: 9, what: 'x' })
  })

  it('an older server sends none, and nothing is made up', () => {
    const r = one({ next_why_vars: [1, 2] })
    expect([r.becauseCode, r.nextWhyCode, r.nextWhyVars]).toEqual([
      null,
      null,
      null,
    ])
  })
})
