import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every draft in the @playom content plan must pass the Leela voice
 * stop-list and quote the board correctly (snakes/arrows as in canon).
 * The plan is the client's deliverable; this keeps it honest as it changes.
 */
const PLAN = join(__dirname, 'src/agent/clients/playom/content-plan-v1.md')

function drafts(md: string): { title: string; body: string }[] {
  const parts = md.split(/^## Черновик · /mu).slice(1) // cyrillic-ok: doc heading
  return parts.map(p => {
    const title = p.split('\n')[0]
    // The reader-facing part: hook, text, practice, question. Editorial
    // notes (the check and the visual idea) may name the forbidden things
    // in order to forbid them.
    const start = p.indexOf('Крючок:') // cyrillic-ok: doc field
    const end = p.indexOf('Визуальная идея:') // cyrillic-ok: doc field
    return { title, body: p.slice(start, end > start ? end : undefined) }
  })
}

describe('@playom content plan v1', () => {
  it('has the twelve drafts of the v1 series, each with every field', () => {
    const md = readFileSync(PLAN, 'utf8')
    const list = drafts(md)
    expect(list).toHaveLength(12)
    for (const d of list) {
      for (const field of [
        'Крючок:', // cyrillic-ok: doc field
        'Текст:', // cyrillic-ok: doc field
        'Практика:', // cyrillic-ok: doc field
        'Вопрос:', // cyrillic-ok: doc field
      ]) {
        expect(d.body, d.title).toContain(field)
      }
      expect(md, d.title).toContain('Визуальная идея:') // cyrillic-ok: doc field
    }
  })

  it('passes violatesLeelaVoice in every reader-facing part and asks at most one question', async () => {
    const { violatesLeelaVoice, LEELA_CTA_RU, LEELA_PLAY_RU } = await import(
      './src/agent/leela-canon'
    )
    const md = readFileSync(PLAN, 'utf8')
    for (const d of drafts(md)) {
      expect(violatesLeelaVoice(d.body), d.title).toEqual([])
      const questions = (d.body.match(/\?/g) ?? []).length
      expect(questions, d.title).toBeLessThanOrEqual(1)
    }
    expect(md.split(LEELA_CTA_RU).length - 1).toBeGreaterThanOrEqual(12)
    expect(md.split(LEELA_PLAY_RU).length - 1).toBeGreaterThanOrEqual(12)
  })

  it('quotes snakes and arrows exactly as the canon tables', async () => {
    const { SNAKES, ARROWS } = await import('./src/agent/leela-canon')
    const md = readFileSync(PLAN, 'utf8')
    for (const m of md.matchAll(/план (\d+) → (\d+)/gu)) {
      // cyrillic-ok: doc pattern
      const from = Number(m[1])
      const to = Number(m[2])
      expect(SNAKES[from] ?? ARROWS[from], m[0]).toBe(to)
    }
    // 55 -> 3 is not the longest snake: 63 -> 2 is.
    expect(55 - SNAKES[55]).toBe(52)
    expect(63 - SNAKES[63]).toBeGreaterThan(55 - SNAKES[55])
    expect(md).not.toMatch(/самая длинная змея доски/u) // cyrillic-ok: forbidden claim
  })
})
