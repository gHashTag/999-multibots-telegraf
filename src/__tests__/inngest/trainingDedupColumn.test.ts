/**
 * The served training handler's duplicate-prevention only works if its
 * check-duplicates query looks at the SAME user column the handler inserts.
 *
 * It inserts the pending record with `telegram_id` (save-pending-record), and
 * that is the column neuroPhoto and getActiveUserModelsByTypeForHaim read too.
 * The dedup step used to filter `.eq('user_id', eventData.telegram_id)` — a
 * column this handler never populates — so it never matched its own
 * PENDING/starting/processing rows and the guard silently allowed duplicate,
 * doubly-expensive trainings.
 *
 * Source-level seam test (the sibling runtime suite is describe.skip — its fs
 * mock kills the vitest worker). It pins that the dedup filter and the insert
 * use the same user column, which a refactor could silently split again.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'inngest_app',
  'functions',
  'existing',
  'generateModelTrainingFunction.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

function checkDuplicatesBlock(s: string): string {
  const start = s.indexOf("step.run('check-duplicates'")
  if (start === -1) return ''
  return s.slice(start, start + 1100)
}

describe('training dedup queries the column the handler actually inserts', () => {
  it('the check-duplicates block exists', () => {
    expect(checkDuplicatesBlock(code()).length).toBeGreaterThan(0)
  })

  it('filters model_trainings by telegram_id, not user_id', () => {
    const block = checkDuplicatesBlock(code())
    expect(
      /\.eq\('telegram_id', eventData\.telegram_id\)/.test(block),
      'dedup does not filter by telegram_id'
    ).toBe(true)
    expect(
      /\.eq\('user_id',/.test(block),
      'dedup still filters by a user_id column the handler never populates'
    ).toBe(false)
  })

  it('inserts the pending record under telegram_id (the same column)', () => {
    const s = code()
    expect(/telegram_id: eventData\.telegram_id/.test(s)).toBe(true)
  })
})
