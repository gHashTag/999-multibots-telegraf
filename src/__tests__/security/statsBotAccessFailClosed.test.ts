/**
 * Ratchet: interactiveStatsCommand bot-access guards fail CLOSED.
 *
 * getOwnedBots(userId) returns null on a transient DB/network error (distinct
 * from [] for a user with no bots). The buggy guard
 * `if (!isAdmin && ownedBots && !ownedBots.includes(botName))` short-circuits
 * the whole condition to false when ownedBots is null, so the deny branch is
 * skipped and a non-admin is GRANTED access to another bot's stats. The 12
 * sibling handlers use the fail-closed checkBotAccess() (returns false on null).
 *
 * This pins the fix: no if-condition in the file uses the fail-open shape
 * `ownedBots && !ownedBots.includes(...)` (a bare truthiness conjunct that
 * allows on null). The fail-closed form is `!ownedBots || !ownedBots.includes`.
 *
 * loop-fable iter197 (found by the bug-hunt-wave3 workflow, authz lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../commands/interactiveStatsCommand.ts'
)

// The fail-open shape: `ownedBots && ... !ownedBots.includes` in one condition
// (ownedBots used as a truthiness guard that grants access on null).
const FAIL_OPEN = /\bownedBots\s*&&[^)]*!\s*ownedBots\.includes/

function analyze(source: string): { conditions: number; failOpen: number[] } {
  const sf = ts.createSourceFile(
    'interactiveStatsCommand.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let conditions = 0
  const failOpen: number[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isIfStatement(n)) {
      const cond = n.expression.getText(sf)
      if (cond.includes('ownedBots')) {
        conditions++
        if (FAIL_OPEN.test(cond)) {
          failOpen.push(
            sf.getLineAndCharacterOfPosition(n.expression.getStart(sf)).line + 1
          )
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { conditions, failOpen }
}

describe('interactiveStatsCommand bot-access guards fail closed', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { conditions, failOpen } = analyze(source)

  it('self-check: detector flags the fail-open shape but not the fail-closed one', () => {
    const open = `if (!isAdmin && ownedBots && !ownedBots.includes(botName)) {}`
    const closed = `if (!isAdmin && (!ownedBots || !ownedBots.includes(botName))) {}`
    expect(analyze(open).failOpen.length).toBe(1)
    expect(analyze(closed).failOpen.length).toBe(0)
  })

  it('matcher is not stale: the file still has ownedBots access conditions', () => {
    expect(conditions).toBeGreaterThanOrEqual(1)
  })

  it('no fail-open ownedBots access guard', () => {
    expect(
      failOpen,
      `A bot-access guard uses the fail-open shape ownedBots && !ownedBots.includes ` +
        `(lines: ${failOpen.join(', ')}). getOwnedBots returns null on error, so this ` +
        `grants a non-admin access to another bot's stats. Use !ownedBots || ... or checkBotAccess().`
    ).toEqual([])
  })
})
