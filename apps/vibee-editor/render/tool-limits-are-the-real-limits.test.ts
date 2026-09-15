import { describe, it, expect } from 'vitest'
import {
  CRM_MEMORY_TOOLS,
  DIALOGS_DEFAULT,
  DIALOGS_MAX,
  DEPTH_DEFAULT,
  DEPTH_MAX,
} from './src/agent/crm-memory-tools'

/**
 * THE LIMIT A TOOL DESCRIBES IS THE LIMIT IT ENFORCES.
 *
 * `crm_ingest_chats` told the model "at most 200 dialogs" while the clamp
 * allowed 2000 -- ten times fewer than the owner asked for, and the comment
 * beside the constant says he asked for ALL of them. A parameter description
 * is not documentation: it is what the MODEL reads before deciding what to
 * pass, so a stale number there is a cap nobody set and nobody can see. The
 * bot's own automated call already asked for 2000; only the model was held
 * back, and silently.
 *
 * Checked through the registered tool, not the file, so a description built
 * somewhere else still has to come out right.
 */
describe('crm_ingest_chats describes the limits it actually applies', () => {
  const tool = CRM_MEMORY_TOOLS.find(t => t.name === 'crm_ingest_chats')

  it('the tool is registered at all', () => {
    expect(tool, 'crm_ingest_chats disappeared from the registry').toBeTruthy()
  })

  const paramDesc = (name: string): string => {
    const p = (
      tool!.parameters as {
        properties?: Record<string, { description?: string }>
      }
    ).properties
    return String(p?.[name]?.description ?? '')
  }

  it('names the dialog default and ceiling it really uses', () => {
    const d = paramDesc('limit')
    expect(d, 'the limit parameter lost its description').not.toBe('')
    expect(d).toContain(String(DIALOGS_DEFAULT))
    expect(
      d,
      'the model is told a ceiling other than the one the clamp applies'
    ).toContain(String(DIALOGS_MAX))
  })

  it('names the depth default and ceiling it really uses', () => {
    const d = paramDesc('depth')
    expect(d).toContain(String(DEPTH_DEFAULT))
    expect(d).toContain(String(DEPTH_MAX))
  })

  it('and the ceiling is the one the owner asked for: all of them', () => {
    // A positive control with a number in it: if somebody lowers the clamp,
    // both tests above still pass (they compare the two ends to each other),
    // and this one says the ends moved.
    expect(DIALOGS_MAX).toBeGreaterThanOrEqual(2000)
    expect(DEPTH_MAX).toBeGreaterThanOrEqual(500)
  })
})

/**
 * THE SAME RULE FOR THE WINDOWS THE WAITING TOOL OFFERS.
 *
 * `crm_waiting` takes two windows and falls back to the named constants when
 * the model passes nothing. Its parameter descriptions carried hand-typed
 * copies of those same numbers -- written the day before, one edit away from
 * saying something the code no longer does.
 *
 * MEASURED, AND LEFT AS IS: putting the literal 3 back SURVIVES this test,
 * because the literal and the constant are the same number today. That is the
 * same shape as the reel price, where a source assertion was added -- and it
 * is not added here on purpose. This guard fails the moment the constant
 * moves, which is the moment the description starts lying. A second pin would
 * only forbid the typing a day earlier, and one such pin in the repository is
 * enough to state the rule.
 */
describe('crm_waiting describes the windows it falls back to', () => {
  it('names both defaults from the constants', async () => {
    const { CRM_TOUCH_TOOLS } = await import('./src/agent/crm-touch-tools')
    const { NO_ANSWER_AFTER_DAYS, LATER_RETURNS_AFTER_DAYS } = await import(
      './src/agent/crm-segments'
    )
    const tool = CRM_TOUCH_TOOLS.find(t => t.name === 'crm_waiting')
    expect(tool, 'crm_waiting disappeared from the registry').toBeTruthy()
    const props = (
      tool!.parameters as {
        properties?: Record<string, { description?: string }>
      }
    ).properties
    expect(String(props?.no_answer_after_days?.description)).toContain(
      String(NO_ANSWER_AFTER_DAYS)
    )
    expect(String(props?.later_after_days?.description)).toContain(
      String(LATER_RETURNS_AFTER_DAYS)
    )
  })
})
