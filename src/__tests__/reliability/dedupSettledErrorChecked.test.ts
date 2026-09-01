/**
 * Ratchet: deduplicateUsers must NOT count a Supabase delete as successful on
 * Promise status alone -- it must also inspect the resolved { error } field.
 *
 * Supabase query builders (`supabase.from('users').delete().eq(...)`) are
 * thenables that RESOLVE with { data, error }; they do NOT reject on an RLS / FK
 * / row-lock failure. So Promise.allSettled reports status:'fulfilled' even for a
 * delete the DB refused. deduplicateUsers used to gate success on
 * `result.status === 'fulfilled'` alone, so a refused delete was counted as a
 * success -- a false 'Successfully deleted' log, errorCount stayed 0, and the
 * function returned true while the duplicate rows it exists to remove persisted
 * (feeding the known duplicate-telegram_id read bugs downstream). Found by the
 * iter238 wave-8 error-swallow lens (adversarially + hand verified: live via
 * getUserByTelegramId's fire-and-forget cleanup, LOW because it self-heals on the
 * next read and the boolean is discarded, but the operator signal is false).
 *
 * This pins: the success branch (successCount++) is gated on a condition that
 * references the resolved error, not just the settled status.
 * floor + self-check + real-source mutation.
 *
 * loop-fable iter238.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../core/supabase/deduplicateUsers.ts')

/**
 * Returns the enclosing-if condition texts guarding each `successCount++`.
 * Empty array if no successCount increment is found.
 */
function successGateConditions(source: string): string[] {
  const sf = ts.createSourceFile(
    'deduplicateUsers.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const conditions: string[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isPostfixUnaryExpression(n) &&
      n.operator === ts.SyntaxKind.PlusPlusToken &&
      ts.isIdentifier(n.operand) &&
      n.operand.text === 'successCount'
    ) {
      let p: ts.Node | undefined = n.parent
      while (p && !ts.isIfStatement(p)) p = p.parent
      if (p && ts.isIfStatement(p)) {
        conditions.push(p.expression.getText(sf))
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return conditions
}

/** True when every successCount++ is gated on a condition that considers the error field. */
function gatesCheckError(source: string): boolean {
  const conds = successGateConditions(source)
  return conds.length > 0 && conds.every(c => /error/i.test(c))
}

describe('deduplicateUsers counts a delete as success only when the DB did not reject it', () => {
  const source = fs.readFileSync(FILE, 'utf8')

  it('floor: a successCount++ gated by an if is present', () => {
    expect(successGateConditions(source).length).toBeGreaterThanOrEqual(1)
  })

  it('every success gate accounts for the resolved error (not status alone)', () => {
    expect(
      gatesCheckError(source),
      `deduplicateUsers counts a delete as successful on Promise status alone. ` +
        `Supabase deletes RESOLVE with { error } (never reject), so a DB-refused ` +
        `delete reports status:'fulfilled'. Gate successCount++ on the resolved ` +
        `error too (e.g. !result.value?.error), or refused deletes count as ` +
        `success and duplicates persist silently.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes an error-aware gate from a status-only one', () => {
    const good = `deleteResults.forEach(result => { const dbError = result.status==='fulfilled'?result.value?.error:undefined; if (result.status!=='rejected' && !dbError) { successCount++ } })`
    const bad = `deleteResults.forEach(result => { if (result.status === 'fulfilled') { successCount++ } })`
    expect(gatesCheckError(good)).toBe(true)
    expect(gatesCheckError(bad)).toBe(false)
  })

  it('mutation: reverting to a status-only gate turns the check RED', () => {
    const mutated = source.replace(
      'if (!rejected && !dbError) {',
      "if (result.status === 'fulfilled') {"
    )
    expect(mutated).not.toEqual(source)
    expect(gatesCheckError(mutated)).toBe(false)
  })
})
