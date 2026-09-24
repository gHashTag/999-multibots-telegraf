import { describe, expect, it } from 'vitest'
/*
 * From the leaf module, not from trinityAgent: several suites mock that one,
 * and a test importing through it would depend on their mocks.
 */
import { STOPPED_BY_OWNER, wasStoppedByOwner } from '@/services/agentStop'
import {
  CRM_ROOT_RE,
  ROOT_VERBS,
  crmCallback,
} from '@/navigation/helpers/crmMenu'

/*
 * STOP MEANS STOP, AND THE TRAP IS THAT IT NEARLY MEANT "AGAIN".
 *
 * Issue #2721 names it before anything else: the turn ends by aborting, the
 * word "abort" sits in the transient list, and a transient fault is REPLAYED.
 * So a person who pressed Stop would have got the work started over -- the
 * opposite of the button.
 */
describe('a stop is final, never a blip', () => {
  it('is recognised by its own marker', () => {
    expect(wasStoppedByOwner(`turn ended: ${STOPPED_BY_OWNER}`)).toBe(true)
  })

  it('is recognised even beside the word that would make it transient', () => {
    /*
     * The real error text carries BOTH: the marker and the transport's own
     * "aborted". Every transient pattern in this repository matches the
     * second one, so a reader that checks it first replays the stop -- which
     * is why the classifier consults this before anything else.
     */
    expect(
      wasStoppedByOwner(
        `${STOPPED_BY_OWNER}: This operation was aborted, timeout`
      )
    ).toBe(true)
  })

  it('an ordinary abort is NOT a stop -- the timeout keeps its meaning', () => {
    // A stop must be told apart from a deadline, not replace it: a turn that
    // ran past its budget is still worth one more try.
    expect(wasStoppedByOwner('This operation was aborted')).toBe(false)
    expect(wasStoppedByOwner('timed out')).toBe(false)
    expect(wasStoppedByOwner(null)).toBe(false)
    expect(wasStoppedByOwner(undefined)).toBe(false)
  })

  it('the classifier asks THIS question before the transient one', async () => {
    /*
     * The order is the defect: "abort" sits in the transient list, so a stop
     * checked later is replayed. A source read, because importing the
     * service here boots the whole bot.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../services/businessBotService.ts'),
      'utf8'
    )
    const body = src.slice(src.indexOf('export function classifyAgentFault'))
    // The CALLS, not the mentions: the comment above the check names the
    // transient pattern too, and the first version of this test compared
    // prose with code.
    const stopAt = body.indexOf('wasStoppedByOwner(message)')
    const transientAt = body.indexOf('AGENT_TRANSIENT_RE.test(')
    expect(
      stopAt,
      'the classifier no longer knows about a stop'
    ).toBeGreaterThan(-1)
    expect(stopAt).toBeLessThan(transientAt)
  })
})

describe('the button exists and the dispatcher hears it', () => {
  it('the verb is known, or the keyboard draws a dead button', () => {
    /*
     * The same joint that caught the gift button a day earlier: a verb in the
     * list and not in the dispatcher regex renders fine and does nothing.
     */
    expect(ROOT_VERBS).toContain('halt')
    expect(CRM_ROOT_RE.test(crmCallback('halt'))).toBe(true)
    /*
     * And it did NOT steal the scope of the same name. `crmCallback` consults
     * the root verbs first, so calling this one `stop` re-routed the existing
     * `crm:scope:stop` button -- somebody else's button, doing the wrong
     * thing, which is worse than a dead one.
     */
    expect(crmCallback('stop')).toBe('crm:scope:stop')
  })

  it('the press reaches a handler, and says so when there is nothing to stop', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const at = src.indexOf("verb === 'halt'")
    expect(at, 'nothing answers the stop press').toBeGreaterThan(-1)
    // Wide enough for the whole arm: at 1400 it silently stopped covering
    // the answer it was written to guard when the handler grew a third path.
    const body = src.slice(at, at + 3000)
    // Through the shared registry (services/ownerRuns.ts), not a map private
    // to this handler: the cron sweep runs in this same process and must be
    // reachable by the same press.
    expect(body).toContain('stopOwnerRun(ownerId(ctx))')
    // A button that sometimes answers and sometimes does not is pressed twice.
    expect(body).toContain('нечего останавливать')
    /*
     * AND THE PRESS LEAVES THE PROCESS.
     *
     * Aborting the local run reaches the turn the person is watching and
     * nothing else: a duet turn writes into a chat of its own, an a2a run
     * outlives the request that made it, and neither has a socket to close.
     * Those are the runs that keep spending after a press, so the press is
     * also written down on the render (services/agentStopRemote.ts).
     */
    expect(body).toContain('requestRemoteStop(ownerId(ctx))')
  })

  it('the Stop rides ON the message the person is waiting at', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    // Both progress messages: the per-lead preparation and the sweep.
    expect(src.match(/stopKeyboard\(\)/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('a stopped turn is not reported as a failure', async () => {
    /*
     * crmFail pages and offers "try again" -- exactly the two wrong things
     * for somebody who has just ended the turn on purpose.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const at = src.indexOf('STOPPED_BY_OWNER')
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(at, at + 400)).toContain('Остановил')
  })
})

/*
 * THE LINK NOBODY HAD PINNED: the press must close the SOCKET.
 *
 * The render already stops on a dropped connection -- `res.on('close')` aborts
 * the run, and `runAgent` checks that signal between steps and before each
 * tool, so work already paid for finishes and nothing new is started or spent
 * (routes.ts). All of that depends on one thing this side: the external signal
 * must abort the very fetch that holds the socket open.
 *
 * Which also corrects what I first said about this feature: the Stop does
 * stop new SPENDING, not only the waiting. Only a tool already in flight
 * finishes.
 */
describe('the press reaches the render, not just the bot', () => {
  it('the external signal aborts the same controller the fetch uses', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../services/trinityAgent.ts'),
      'utf8'
    )
    const at = src.indexOf('const onStop = ')
    expect(at, 'nothing listens to the external signal').toBeGreaterThan(-1)
    const body = src.slice(at, at + 500)
    // The same controller whose signal is handed to fetch below.
    // The controller's name is one of this repository's pre-existing Cyrillic
    // identifiers, and the guard here reads a regex literal as code -- so the
    // check is a plain substring.
    expect(body.includes('.abort()')).toBe(true)
    expect(src).toContain('signal: прерыватель.signal')
  })

  it('the turn a clock started is reachable by the same press', async () => {
    /*
     * Issue #2721 lists the cron sweep among the runs that cannot be stopped
     * "because they have no socket". Half of that is wrong: the sweep runs in
     * THIS process, and it was unreachable only because the registry lived
     * inside the button handler's closure.
     *
     * What remains genuinely out of reach is a run in ANOTHER service with no
     * socket -- a duet, an a2a call -- and that needs `stop_requested_at` at
     * step boundaries rather than a controller here.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sweep = readFileSync(
      join(__dirname, '../../services/crmProactive.ts'),
      'utf8'
    )
    expect(sweep).toContain('beginOwnerRun(owner)')
    expect(sweep).toContain('signal: stopper.signal')
  })
})
