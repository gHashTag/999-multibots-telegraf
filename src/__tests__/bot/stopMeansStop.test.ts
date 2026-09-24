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
    const body = src.slice(at, at + 1400)
    expect(body).toContain('running.get(ownerId(ctx))')
    expect(body).toContain('abort()')
    // A button that sometimes answers and sometimes does not is pressed twice.
    expect(body).toContain('нечего останавливать')
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
