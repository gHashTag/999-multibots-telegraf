/**
 * Ratchet: the videoGenerator supabaseHelper must NOT use `.single()` on a query
 * filtered by telegram_id -- telegram_id is NOT unique in `users`.
 *
 * Production data has ~19 telegram_ids with 2-3 rows each (measured in
 * updateUserBalance.ts). `.single()` returns a PGRST116 error for those rows.
 * getUserHelper used `.single()` and returned null on that error, so the
 * image-to-video flow (imageToVideoWizard -> handleImageToVideoDirect ->
 * generateImageToVideo -> getUserHelper) aborted those ~19 paying users with a
 * misleading "❌ Пользователь не найден", before the charge step. updateUserLevelHelper
 * shared the defect (benign -- level un-incremented). The sibling readers
 * getUserByTelegramId and updateUserBalance were deliberately migrated off
 * `.single()` to `.order('updated_at').limit(...)` for exactly this reason; this
 * "Renamed from getUserByTelegramId" copy was left behind. Found by the iter241
 * wave-10 single-row-absence lens, adversarially + hand verified.
 *
 * This pins: no `.single()` call whose query chain filters by telegram_id.
 * floor + self-check + real-source mutation. (A `.single()` on a truly-unique key
 * would be fine -- only telegram_id chains are pinned.)
 *
 * loop-fable iter241.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../modules/videoGenerator/helpers/supabaseHelper.ts'
)

/** Count `.single()` calls whose receiver chain references telegram_id. */
function singleOnTelegramId(source: string): number {
  const sf = ts.createSourceFile(
    'supabaseHelper.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let count = 0
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'single'
    ) {
      const chain = n.expression.expression.getText(sf)
      if (/telegram_id/.test(chain)) count++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return count
}

/** Does the file query users by telegram_id at all (matcher-not-stale floor)? */
function queriesByTelegramId(source: string): boolean {
  return /\.eq\(\s*['"]telegram_id['"]/.test(source)
}

describe('videoGenerator supabaseHelper tolerates non-unique telegram_id', () => {
  const source = fs.readFileSync(FILE, 'utf8')

  it('floor: the helper still queries users by telegram_id', () => {
    expect(queriesByTelegramId(source)).toBe(true)
  })

  it('no .single() on a telegram_id query (non-unique -> errors for dup-row users)', () => {
    expect(
      singleOnTelegramId(source),
      `supabaseHelper uses .single() on a telegram_id query. telegram_id is NOT ` +
        `unique (~19 users have 2-3 rows); .single() errors (PGRST116) for them, ` +
        `so the reader returns null and the flow aborts. Use ` +
        `.order('updated_at',{ascending:false}).limit(1) and take the first row.`
    ).toBe(0)
  })

  it('self-check: detector flags .single() on telegram_id, not order+limit', () => {
    const bad = `await supabase.from('users').select('level').eq('telegram_id', id).single()`
    const good = `await supabase.from('users').select('level').eq('telegram_id', id).order('updated_at',{ascending:false}).limit(1)`
    const singleUnique = `await supabase.from('users').select('*').eq('id', uuid).single()`
    expect(singleOnTelegramId(bad)).toBe(1)
    expect(singleOnTelegramId(good)).toBe(0)
    expect(singleOnTelegramId(singleUnique)).toBe(0) // .single() on a unique key is fine
  })

  it('mutation: reverting an order+limit back to .single() turns the check RED', () => {
    const mutated = source.replace(
      /\.order\('updated_at', \{ ascending: false \}\)\s*\.limit\(1\)/,
      '.single()'
    )
    expect(mutated).not.toEqual(source)
    expect(singleOnTelegramId(mutated)).toBeGreaterThan(0)
  })
})
