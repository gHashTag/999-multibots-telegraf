/**
 * Ratchet: every AI Reels render-callback status branch that NOTIFIES the user
 * (handleCompletedRender / handleFailedRender) forwards the per-request bot
 * (?bot=) so the notice is sent from the correct tenant's bot, not defaultBot.
 *
 * The Express callback route (ai-reels-callback.routes.ts) dispatches by status.
 * The completed branch forwards `bot_name: (req.query?.bot as string) || undefined`
 * -- a fix that was applied AFTER this exact class bit once (see the in-file
 * comment: the finished video was sent via defaultBot, so the wrong tenant's bot
 * messaged the user). The failed branch used to omit it, so handleFailedRender's
 * botName fell back to defaultBot -- the same cross-tenant misdelivery (a leak /
 * a 403 loss) on the failure path.
 *
 * That failed branch is currently UNREACHABLE (the render server's sendCallback
 * posts only { download_url } on success -- never status:'failed'), so this pins
 * a latent defense-in-depth symmetry: if failure callbacks are ever enabled, the
 * two notifying branches stay consistent and bot-scoped. handleProcessingUpdate
 * is exempt -- its bot.telegram.sendMessage is commented out (it only logs).
 *
 * This pins: every handle(Completed|Failed)Render CALL forwards a bot_name
 * property in its payload object. floor + self-check + real-source mutation.
 *
 * loop-fable iter237.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../api_server/routes/ai-reels-callback.routes.ts'
)

/** Is `n` a call to handleCompletedRender / handleFailedRender? */
function isNotifyDispatch(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isIdentifier(n.expression) &&
    /^handle(Completed|Failed)Render$/.test(n.expression.text)
  )
}

/** Does any argument object literal carry a `bot_name` property? */
function payloadForwardsBot(call: ts.CallExpression): boolean {
  const obj = call.arguments.find(ts.isObjectLiteralExpression)
  if (!obj) return false
  return obj.properties.some(
    p =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      p.name !== undefined &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'bot_name'
  )
}

function analyze(source: string): { total: number; missing: number } {
  const sf = ts.createSourceFile(
    'ai-reels-callback.routes.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let total = 0
  let missing = 0
  const visit = (n: ts.Node): void => {
    if (isNotifyDispatch(n)) {
      total++
      if (!payloadForwardsBot(n)) missing++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, missing }
}

describe('AI Reels render-callback notifies from the correct tenant bot', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: both notifying dispatches are present (completed + failed)', () => {
    expect(a.total).toBeGreaterThanOrEqual(2)
  })

  it('every notifying dispatch forwards bot_name (no silent defaultBot)', () => {
    expect(
      a.missing,
      `A handle(Completed|Failed)Render dispatch omits bot_name, so its ` +
        `notice would be sent from defaultBot instead of the per-request ?bot ` +
        `tenant -- a cross-tenant misdelivery. Forward ` +
        `bot_name: (req.query?.bot as string) || undefined, mirroring the sibling branch.`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a bot-forwarding call from a bare one', () => {
    const good = `handleFailedRender(id, { bot_name: b, job_id: j })`
    const bad = `handleFailedRender(id, { job_id: j })`
    expect(analyze(good).missing).toBe(0)
    expect(analyze(bad).missing).toBe(1)
  })

  it('mutation: dropping bot_name from a real dispatch turns the check RED', () => {
    const mutated = source.replace(
      /bot_name: \(req\.query\?\.bot as string\) \|\| undefined,/g,
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).missing).toBeGreaterThan(0)
  })
})
