/*
 * THE WELCOME ROAD STARTS FROM FACTS, NOT FROM A FLAG.
 *
 * Owner, 2026-09-09: value -> club -> Telegram -> SOUL -> ready. A member who
 * paid is not shown the paywall again; a connected person is not asked for
 * the phone again; a person with a SOUL is not asked to write one. Skipping
 * is allowed only on the story. The composed SOUL keeps the editor's shape
 * and invents nothing.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  WELCOME_STEPS,
  composeSoul,
  soulHasSubstance,
  welcomeIndex,
  welcomeNext,
  welcomePrev,
  welcomeStart,
} from './welcomeSteps'

describe('welcomeStart', () => {
  it.each([
    [{ club: false, connected: false, soul: false }, 'value'],
    [{ club: false, connected: true, soul: true }, 'value'],
    [{ club: true, connected: false, soul: false }, 'connect'],
    [{ club: true, connected: true, soul: false }, 'soul'],
    [{ club: true, connected: true, soul: true }, 'done'],
  ] as const)('%j -> %s', (facts, step) => {
    expect(welcomeStart(facts)).toBe(step)
  })
})

describe('the road', () => {
  it('has six steps in the owner\u2019s order', () => {
    expect(WELCOME_STEPS).toEqual([
      'value',
      'how',
      'club',
      'connect',
      'soul',
      'done',
    ])
    expect(welcomeIndex('value')).toBe(1)
    expect(welcomeIndex('done')).toBe(6)
  })

  it('moves one step at a time and stops at the ends', () => {
    expect(welcomeNext('value')).toBe('how')
    expect(welcomeNext('club')).toBe('connect')
    expect(welcomeNext('done')).toBe('done')
    expect(welcomePrev('how')).toBe('value')
    expect(welcomePrev('value')).toBe('value')
  })

  it('exports no skip and no leave: every step is mandatory', async () => {
    // Owner, 2026-09-09, evening: "until paid the profile does not open;
    // every step is mandatory; we do not move on until the step is done".
    const mod = await import('./welcomeSteps')
    expect(Object.keys(mod)).not.toEqual(
      expect.arrayContaining(['welcomeCanSkip', 'welcomeCanLeave'])
    )
  })
})

describe('composeSoul', () => {
  const answers = {
    who: 'Фотограф на Самуи', // cyrillic-ok: sample SOUL text
    sell: 'Съёмки и пресеты', // cyrillic-ok: sample SOUL text
    voice: 'Просто, по-дружески', // cyrillic-ok: sample SOUL text
    forbidden: '',
  }

  it('uses the same four headings as the full editor', () => {
    const editor = fs.readFileSync(
      path.join(__dirname, 'SoulEditor.tsx'),
      'utf8'
    )
    const soul = composeSoul(answers)
    for (const h of [
      '## Кто я',
      '## Чем зарабатываю',
      '## Голос',
      '## Что запрещено',
    ]) {
      // cyrillic-ok: SOUL.md headings
      expect(editor).toContain(h)
      expect(soul).toContain(h)
    }
  })

  it('keeps every answer verbatim and marks an empty one instead of inventing', () => {
    const soul = composeSoul(answers)
    expect(soul).toContain(answers.who)
    expect(soul).toContain(answers.sell)
    expect(soul).toContain(answers.voice)
    expect(soul).toMatch(/## Что запрещено\n\(пока не заполнено\)/) // cyrillic-ok: SOUL.md text
  })

  it('refuses to call four blanks a SOUL', () => {
    expect(
      soulHasSubstance({ who: ' ', sell: '', voice: '', forbidden: '' })
    ).toBe(false)
    expect(soulHasSubstance({ ...answers, who: '' })).toBe(true)
  })
})

describe('the paywall tells the truth of the server', () => {
  const road = fs.readFileSync(
    path.join(__dirname, 'WelcomeOnboarding.tsx'),
    'utf8'
  )
  const club = fs.readFileSync(
    path.join(__dirname, '..', '..', 'atoms', 'club.ts'),
    'utf8'
  )
  const lang = fs.readFileSync(
    path.join(__dirname, '..', '..', 'atoms', 'language.ts'),
    'utf8'
  )

  it('reads price, period and tokens from /api/club/status, never from a literal', () => {
    expect(club).toContain('/api/club/status')
    expect(club).toContain('/api/club/invoice')
    expect(club).toContain('/api/club/verify')
    expect(road).toContain('status?.stars')
    expect(road).toContain('status?.period_days')
    expect(road).toContain('status?.tokens_per_period')
    expect(road).not.toMatch(/10[ _]?000/)
    expect(road).not.toMatch(/2[ _]?571/)
  })

  it('never calls "paid" what the ledger has not shown', () => {
    expect(club).toContain('if (vd.ok && vd.active)')
    expect(club).toContain("return 'pending'")
    expect(lang).toContain("'welcome.club.pending'")
  })

  it('does not sell in dollars, per month, or as the first or best anything', () => {
    const welcome = lang
      .split('\n')
      .filter(l => l.includes("'welcome."))
      .join('\n')
    expect(welcome).not.toMatch(/\$\d/)
    expect(welcome).not.toMatch(/\/month|\/месяц|в месяц/) // cyrillic-ok: forbidden Russian wording
    const superlative =
      /первый в|первая|единственн|лучший|the first|the only|the best/i // cyrillic-ok: forbidden wording
    expect(welcome).not.toMatch(superlative)
  })
})
