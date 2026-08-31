/**
 * Ratchet: createVoiceAvatar must never log the token-bearing fileUrl.
 *
 * fileUrl here is https://api.telegram.org/file/bot<BOT_TOKEN>/<path> (built in
 * voiceAvatarWizard from ctx.telegram.token), so it embeds the full bot token
 * (a full-control credential) plus an unauthenticated link to the user's voice
 * recording (biometric PII). console.log bypasses the winston redactBotToken
 * redaction (which only runs inside the winston printf), so logging fileUrl
 * puts the verbatim token on stdout/Railway. This pins the fix: no console.*
 * call in this file may reference the fileUrl identifier.
 *
 * loop-fable iter195 (found by the bug-hunt-fresh-lenses workflow, PII lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../services/plan_b/createVoiceAvatar.ts'
)

function isConsoleCall(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'console'
  )
}

/** Does the subtree reference an identifier named `fileUrl`? */
function refsFileUrl(n: ts.Node): boolean {
  let found = false
  const walk = (m: ts.Node): void => {
    if (ts.isIdentifier(m) && m.text === 'fileUrl') found = true
    m.forEachChild(walk)
  }
  walk(n)
  return found
}

function analyze(source: string): { consoleCalls: number; leaks: number[] } {
  const sf = ts.createSourceFile(
    'createVoiceAvatar.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let consoleCalls = 0
  const leaks: number[] = []
  const visit = (n: ts.Node): void => {
    if (isConsoleCall(n)) {
      consoleCalls++
      if (n.arguments.some(a => refsFileUrl(a))) {
        leaks.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { consoleCalls, leaks }
}

describe('createVoiceAvatar does not log the token-bearing fileUrl', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { consoleCalls, leaks } = analyze(source)

  it('self-check: detector flags fileUrl in a console call but not a safe one', () => {
    const leaky = `console.log('x', { fileUrl, telegram_id })`
    const safe = `console.log('x', { telegram_id, username })`
    expect(analyze(leaky).leaks.length).toBe(1)
    expect(analyze(safe).leaks.length).toBe(0)
  })

  it('matcher is not stale: the file still uses console logging', () => {
    expect(consoleCalls).toBeGreaterThanOrEqual(1)
  })

  it('no console.* call references fileUrl', () => {
    expect(
      leaks,
      `createVoiceAvatar logs the token-bearing fileUrl (lines: ${leaks.join(', ')}). ` +
        `console.log bypasses redactBotToken -- the full bot token hits stdout. ` +
        `Log only non-sensitive fields (telegram_id, username).`
    ).toEqual([])
  })
})
