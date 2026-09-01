/**
 * Ratchet: the users-table readers that have been migrated off `.single()` on the
 * non-unique telegram_id column must stay migrated (no regression back to
 * `.single()`).
 *
 * telegram_id is NOT unique in `users` (~19 telegram_ids have 2-3 rows -- see
 * updateUserBalance.ts / migrate-schema.sql). `.single()` on a telegram_id query
 * returns a PGRST116 error for those rows, so the reader yields null/default.
 * getUserHelper aborted image-to-video for those users (#1599); this batch (#1602-
 * range, iter242) migrates the safe graceful-null getters getAspectRatio /
 * getUserLevel / getUserModel, which previously handed those users the DEFAULT
 * value (1:1 / null / deepseek-chat) instead of their real one. The systemic
 * remainder is tracked by `node .claude/loop-opus/single-telegram-audit.mjs` and
 * routed to owner (task_abdf6ba1); this ratchet is the per-file whitelist that
 * only grows as readers are migrated.
 *
 * floor + self-check + real-source mutation.
 *
 * loop-fable iter242.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

// Files migrated off .single()-on-telegram_id. ADD to this list when you migrate
// another reader (drives single-telegram-audit's count down and pins the win).
const MIGRATED = [
  'core/supabase/getAspectRatio.ts',
  'core/supabase/getUserLevel.ts',
  'core/supabase/getUserModel.ts',
]

/** Count `.single()` calls whose query chain filters by telegram_id. */
function singleOnTelegramId(source: string): number {
  const sf = ts.createSourceFile(
    'x.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let n = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'single' &&
      /\.eq\(\s*['"]telegram_id['"]/.test(
        node.expression.expression.getText(sf)
      )
    ) {
      n++
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return n
}

const abs = (rel: string) => path.resolve(__dirname, '../../', rel)

describe('migrated users-readers stay off .single()-on-telegram_id', () => {
  it('floor: each migrated file still queries users by telegram_id', () => {
    for (const rel of MIGRATED) {
      const src = fs.readFileSync(abs(rel), 'utf8')
      expect(/\.eq\(\s*['"]telegram_id['"]/.test(src), rel).toBe(true)
    }
  })

  it('no migrated file uses .single() on a telegram_id query', () => {
    for (const rel of MIGRATED) {
      const src = fs.readFileSync(abs(rel), 'utf8')
      expect(
        singleOnTelegramId(src),
        `${rel} regressed to .single() on the non-unique telegram_id column. ` +
          `Use .order('updated_at',{ascending:false}).limit(1) + take the first row.`
      ).toBe(0)
    }
  })

  it('self-check: detector flags .single() on telegram_id, not order+limit', () => {
    const bad = `supabase.from('users').select('level').eq('telegram_id', id).single()`
    const good = `supabase.from('users').select('level').eq('telegram_id', id).order('updated_at',{ascending:false}).limit(1)`
    expect(singleOnTelegramId(bad)).toBe(1)
    expect(singleOnTelegramId(good)).toBe(0)
  })

  it('mutation: reverting a migrated reader to .single() turns the check RED', () => {
    const src = fs.readFileSync(abs('core/supabase/getAspectRatio.ts'), 'utf8')
    const mutated = src.replace(
      /\.order\('updated_at', \{ ascending: false \}\)\s*\.limit\(1\)/,
      '.single()'
    )
    expect(mutated).not.toEqual(src)
    expect(singleOnTelegramId(mutated)).toBeGreaterThan(0)
  })
})
