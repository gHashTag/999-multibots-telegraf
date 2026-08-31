/**
 * Ratchet: handleModelTrainingCompleted dedups a replayed completion webhook.
 *
 * Replicate webhooks are at-least-once: a re-POST of model/training.completed
 * creates a NEW Inngest event = a NEW run of this function. Without a guard the
 * 'send-telegram-notification' step re-sends the completion message to the user
 * on every retry. The find-training-record step reads the record's current
 * status; if it is ALREADY terminal (SUCCESS/FAILED/CANCELED) a prior run
 * finalized + notified it, so this run must skip. (find-training-record is
 * memoized within a run, so a run that first read a non-terminal status keeps
 * attempting the notify across Inngest retries -- no first notification is ever
 * dropped; only a separate replay run sees the terminal status and skips.)
 *
 * This pins that guard: a terminal-status check with a return, positioned BEFORE
 * the send-telegram-notification step.
 *
 * loop-fable iter206 (wave-10 webhook-replay-no-dedup lens, backlog).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../inngest_app/functions/existing/handleModelTrainingCompleted.ts'
)

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

function analyze(source: string): {
  notifyStepPos: number
  dedupGuardPos: number
} {
  const sf = ts.createSourceFile('h.ts', source, ts.ScriptTarget.Latest, true)
  let notifyStepPos = -1
  let dedupGuardPos = -1
  const visit = (n: ts.Node): void => {
    // the notify step: a string literal 'send-telegram-notification'
    if (
      ts.isStringLiteral(n) &&
      n.text === 'send-telegram-notification' &&
      notifyStepPos === -1
    ) {
      notifyStepPos = n.getStart(sf)
    }
    // the dedup guard: an if whose condition references TERMINAL_STATUSES and
    // whose body returns.
    if (
      ts.isIfStatement(n) &&
      subtreeHas(
        n.expression,
        m => ts.isIdentifier(m) && m.text === 'TERMINAL_STATUSES'
      ) &&
      subtreeHas(n.thenStatement, m => ts.isReturnStatement(m)) &&
      dedupGuardPos === -1
    ) {
      dedupGuardPos = n.getStart(sf)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { notifyStepPos, dedupGuardPos }
}

describe('handleModelTrainingCompleted dedups a replayed webhook before re-notifying', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the notify step this ratchet guards still exists.
  it('still has the send-telegram-notification step', () => {
    expect(a.notifyStepPos).toBeGreaterThan(-1)
  })

  it('has a terminal-status dedup guard (with a return) before the notify step', () => {
    expect(a.dedupGuardPos).toBeGreaterThan(-1)
    expect(a.dedupGuardPos).toBeLessThan(a.notifyStepPos)
  })

  it('self-check: a file with no dedup guard is detected', () => {
    const bad = `async function h() {
      const r = await step.run('find-training-record', async () => ({ status: 'processing' }))
      await step.run('send-telegram-notification', async () => sendMessage())
    }`
    const r = analyze(bad)
    expect(r.notifyStepPos).toBeGreaterThan(-1)
    expect(r.dedupGuardPos).toBe(-1)
  })
})
