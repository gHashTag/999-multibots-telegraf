import { describe, it, expect } from 'vitest'
import fs from 'fs'

/**
 * THE BOT MUST NOT ANSWER ON TOP OF THE OWNER.
 *
 * The takeover pause is checked once, before the agent runs -- and the agent
 * runs for seconds, sometimes minutes. In that window the owner can open the
 * chat and answer the client himself, which sets the pause. Nothing looked at
 * it again, so the composed answer went out anyway: the client got two replies
 * to one message, one of them from a bot that had not heard what the owner had
 * just said, both signed with the owner's name.
 *
 * Asserted structurally, the way the single-flight guard beside it is: the
 * real path needs a live Telegram connection and a paid model. What is checked
 * is the ORDER that makes the guard mean anything -- a second look at the pause
 * AFTER the answer exists and BEFORE it is sent. A check that drifts above the
 * agent call is the bug this fixes, and it fails here.
 */
describe('an owner who steps in mid-turn is not talked over', () => {
  const src = fs.readFileSync('src/services/businessBotService.ts', 'utf8')

  /** Where the answer is composed: the agent, or chatWithAI as its fallback. */
  const answerIdx = src.search(/await (answerClient|chatWithAI)\(/)
  /**
   * The re-read of the pause map that this guard is made of.
   *
   * `\s+` where a space might be, not a literal space: prettier wrapped this
   * very line the moment it was committed (it runs past eighty characters),
   * and the first version of this test went red on formatting rather than on
   * behaviour. A source assertion has to be written against the FORMATTED
   * source, or it guards the layout instead of the code.
   */
  const recheckIdx = src.search(
    /const tookOverMeanwhile\s*=\s*\(ownerTakeoverUntil\.get\(chatKey\)\s*\?\?\s*0\)\s*>\s*Date\.now\(\)/
  )
  /** Where the answer actually leaves for the client. */
  const sendIdx = src.search(/await sendAsOwner\(parts\[i\]/)

  it('looks at the pause a second time at all', () => {
    expect(recheckIdx, 'no second look at the takeover pause').toBeGreaterThan(
      -1
    )
  })

  it('looks AFTER the answer is composed, not before', () => {
    // A check that sits above the agent call is the original bug: it cannot
    // see a takeover that happens while the agent is thinking.
    expect(answerIdx, 'the answer call was not found').toBeGreaterThan(-1)
    expect(
      recheckIdx,
      'the second look happens before the answer exists, so it sees nothing new'
    ).toBeGreaterThan(answerIdx)
  })

  it('looks BEFORE the answer is sent', () => {
    expect(sendIdx, 'the send was not found').toBeGreaterThan(-1)
    expect(
      recheckIdx,
      'the answer is already on its way by the time the pause is read'
    ).toBeLessThan(sendIdx)
  })

  it('drops the turn instead of sending it, and says so', () => {
    // Between the check and the send there must be a return. Queuing it for
    // later would be worse: it was composed without the owner's message in
    // the history, so it answers a conversation that has moved on.
    const between = src.slice(recheckIdx, sendIdx)
    expect(between, 'nothing stops the answer after the check').toMatch(
      /if \(tookOverMeanwhile\)[\s\S]{0,400}?return/
    )
    expect(between).toContain('takeoverSkipped')
  })
})
