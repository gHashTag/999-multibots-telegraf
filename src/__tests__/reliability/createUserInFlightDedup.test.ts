/**
 * Ratchet: createUserByTelegramId dedups concurrent creates via an in-flight map,
 * so a double-tap for a brand-new user does not INSERT two `users` rows.
 *
 * telegram_id is NOT unique in `users`. createUserByTelegramId does check-then-insert
 * (SELECT by telegram_id, else INSERT) with no upsert/constraint. Two concurrent
 * enters for a brand-new user (a double-tap before /start; via checkBalanceScene's
 * auto-create branch) both SELECT-miss and both INSERT -> two rows for one
 * telegram_id. This is the WRITE that MANUFACTURES the ~19 duplicate-row users the
 * .single()-on-telegram_id readers (migrated in #1599/#1603/#1604/#1607) trip over.
 *
 * The mitigation shares ONE in-flight promise per telegram_id (single multi-bot
 * process; the get->set is atomic on the event loop): concurrent creates await the
 * same insert, so it happens once. The definitive fix (cross-instance) is a
 * UNIQUE(telegram_id) DB constraint + upsert -- routed to owner.
 *
 * This pins: createUserByTelegramId references inFlightCreates .get (early-return)
 * and .set (register). floor + self-check + real-source mutation.
 *
 * Found by the iter246 wave-11 insert-race-duplicate lens (adversarially + hand
 * verified as the root cause of the duplicate-telegram_id class).
 *
 * loop-fable iter246.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../core/supabase/getUserByTelegramId.ts'
)

/** Text of the createUserByTelegramId function (arrow), or '' if absent. */
function createFnText(source: string): string {
  const sf = ts.createSourceFile(
    'x.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let text = ''
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'createUserByTelegramId' &&
      n.initializer
    ) {
      text = n.initializer.getText(sf)
    }
    if (!text) n.forEachChild(visit)
  }
  visit(sf)
  return text
}

/** Does the function dedup concurrent creates (in-flight get + set)? */
function dedups(source: string): boolean {
  const t = createFnText(source)
  return (
    /inFlightCreates\.get\(/.test(t) &&
    /inFlightCreates\.set\(/.test(t) &&
    /\.insert\(/.test(t)
  )
}

describe('createUserByTelegramId dedups concurrent creates (no duplicate users row)', () => {
  const source = fs.readFileSync(FILE, 'utf8')

  it('floor: createUserByTelegramId exists and still inserts users', () => {
    const t = createFnText(source)
    expect(t.length).toBeGreaterThan(0)
    expect(/\.insert\(/.test(t)).toBe(true)
  })

  it('dedups the create via the in-flight map (get early-return + set)', () => {
    expect(
      dedups(source),
      `createUserByTelegramId no longer dedups concurrent creates. A double-tap ` +
        `for a brand-new user will INSERT two users rows for one telegram_id ` +
        `(telegram_id is not unique). Keep the inFlightCreates get/set dedup ` +
        `around the check-then-insert.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes a deduped create from a bare one', () => {
    const good = `const createUserByTelegramId = async (ctx) => { const f = inFlightCreates.get(id); if(f) return f; const p = (async()=>{ await s.from('users').insert([{}]) })(); inFlightCreates.set(id,p); return await p }`
    const bad = `const createUserByTelegramId = async (ctx) => { await s.from('users').insert([{}]) }`
    expect(dedups(good)).toBe(true)
    expect(dedups(bad)).toBe(false)
  })

  it('mutation: removing the in-flight set turns the check RED', () => {
    const mutated = source.replace(
      /inFlightCreates\.set\(telegramId, promise\)/,
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(dedups(mutated)).toBe(false)
  })
})
