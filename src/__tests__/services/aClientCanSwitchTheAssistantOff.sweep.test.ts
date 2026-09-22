/**
 * THE SWEEP DRAWS NO OUTREACH CARD FOR A CLIENT WHO SWITCHED THE ASSISTANT OFF,
 * AND THE BOT AND THE RENDER READ THE SAME ROW WITH THE SAME SQL.
 *
 * The render hides such a person from crm_leads and refuses to prepare a draft
 * for them (tested in the render). This is the bot's last door -- the owner's
 * chat -- for a draft a sweep turn made before the client said stop.
 *
 * Ids are invented (9000000xx).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { sweepOnce, resetProactiveForTests } from '@/services/crmProactive'
import type { SweepDeps } from '@/services/crmProactive'
import {
  OPT_OUT_TABLE,
  OPT_OUT_LIST,
  setOptOutDbForTests,
  forgetOptOutMemoryForTests,
  recordClientStop,
} from '@/services/assistantOptOut'
import * as render from '../../../apps/vibee-editor/render/src/agent/assistant-opt-out'
import { optOutDouble } from './optOutDouble'

const OWNER = '900000081'
const OTHER_OWNER = '900000083'
const CLIENT = '900000082'

function deps() {
  const pushed: string[] = []
  const d: SweepDeps = {
    ask: async () =>
      ({
        текст: 'prepared', // cyrillic-ok: pre-existing field
        proposal: {
          id: 'p-stop',
          action: 'send',
          target: CLIENT,
          lead: CLIENT,
          what: 'hello',
          secret: 's',
        },
        tools: ['tg_send'],
      }) as never,
    ingest: async () => undefined,
    push: async (_owner, draft) => {
      pushed.push(String((draft as { id: string }).id))
    },
    record: async () => 'recorded',
  }
  return { d, pushed }
}

beforeEach(() => {
  resetProactiveForTests()
  forgetOptOutMemoryForTests()
})

describe('the sweep and a client who switched the assistant off', () => {
  it('control: a card for somebody who did not is pushed', async () => {
    setOptOutDbForTests(optOutDouble() as never)
    const { d, pushed } = deps()
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(pushed).toEqual(['p-stop'])
  })

  it('draws no card for them', async () => {
    const db = optOutDouble()
    setOptOutDbForTests(db as never)
    await recordClientStop(OWNER, CLIENT)
    forgetOptOutMemoryForTests() // the row, not this process, must decide

    const { d, pushed } = deps()
    const r = await sweepOnce(OWNER, d)

    expect(pushed, 'an outreach card reached the owner').toEqual([])
    expect(r.did).toBe('idle')
    expect(r.why).toContain(CLIENT)
  })

  it("another owner's opt-out does not stop this owner's card", async () => {
    const db = optOutDouble()
    setOptOutDbForTests(db as never)
    await recordClientStop(OTHER_OWNER, CLIENT)
    forgetOptOutMemoryForTests()

    const { d, pushed } = deps()
    await sweepOnce(OWNER, d)
    expect(pushed).toEqual(['p-stop'])
  })
})

describe('one table, one question, in both services', () => {
  it('the table and the list query are the same strings', () => {
    expect(render.OPT_OUT_TABLE).toBe(OPT_OUT_TABLE)
    expect(render.OPT_OUT_LIST).toBe(OPT_OUT_LIST)
  })

  it('what the bot writes, the render reads', async () => {
    const db = optOutDouble()
    setOptOutDbForTests(db as never)
    await recordClientStop(OWNER, CLIENT)

    const off = await render.optedOutOf(db as never, OWNER)
    expect([...off.keys()]).toEqual([CLIENT])
    expect(await render.optedOutOf(db as never, OTHER_OWNER)).toEqual(new Map())
  })
})
