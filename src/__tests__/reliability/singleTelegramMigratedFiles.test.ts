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
  'core/supabase/getUserData.ts',
  'db/userSettings.ts',
]

// Functions migrated within a file that still holds OTHER .single()-on-telegram_id
// sites (so the whole-file check above can't apply). ADD an entry when you migrate
// one function of a shared file (e.g. the ai.ts hub of duplicate copies).
const MIGRATED_FUNCTIONS: Array<{ file: string; fn: string }> = [
  { file: 'core/supabase/ai.ts', fn: 'getAspectRatio' },
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
      (node.expression.name.text === 'single' ||
        node.expression.name.text === 'maybeSingle') &&
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

/** Count `.single()`-on-telegram_id within a named function's body (-1 if absent). */
function singleOnTelegramIdInFn(source: string, fnName: string): number {
  const sf = ts.createSourceFile(
    'x.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let target: ts.Node | undefined
  const find = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) && node.name?.text === fnName) ||
      (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === fnName)
    ) {
      target = node
    }
    if (!target) node.forEachChild(find)
  }
  find(sf)
  if (!target) return -1
  let n = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'single' ||
        node.expression.name.text === 'maybeSingle') &&
      /\.eq\(\s*['"]telegram_id['"]/.test(
        node.expression.expression.getText(sf)
      )
    ) {
      n++
    }
    node.forEachChild(visit)
  }
  visit(target)
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

  it('each migrated function is present and off .single()-on-telegram_id', () => {
    for (const { file, fn } of MIGRATED_FUNCTIONS) {
      const src = fs.readFileSync(abs(file), 'utf8')
      const n = singleOnTelegramIdInFn(src, fn)
      expect(
        n,
        `${file}#${fn} not found (matcher stale)`
      ).toBeGreaterThanOrEqual(0)
      expect(n, `${file}#${fn} regressed to .single() on telegram_id`).toBe(0)
    }
  })

  it('self-check: scoped detector isolates the target function', () => {
    const src = `
      export const good = async (id) => {
        await supabase.from('users').select('x').eq('telegram_id', id).order('updated_at').limit(1)
      }
      export const bad = async (id) => {
        await supabase.from('users').select('x').eq('telegram_id', id).single()
      }`
    expect(singleOnTelegramIdInFn(src, 'good')).toBe(0)
    expect(singleOnTelegramIdInFn(src, 'bad')).toBe(1)
    expect(singleOnTelegramIdInFn(src, 'missing')).toBe(-1)
  })

  it('self-check: detector flags .single() on telegram_id, not order+limit', () => {
    const bad = `supabase.from('users').select('level').eq('telegram_id', id).single()`
    const good = `supabase.from('users').select('level').eq('telegram_id', id).order('updated_at',{ascending:false}).limit(1)`
    expect(singleOnTelegramId(bad)).toBe(1)
    expect(singleOnTelegramId(good)).toBe(0)
  })

  it('self-check: detector also flags .maybeSingle() on telegram_id', () => {
    const bad = `supabase.from('users').select('x').eq('telegram_id', id).maybeSingle()`
    expect(singleOnTelegramId(bad)).toBe(1)
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
