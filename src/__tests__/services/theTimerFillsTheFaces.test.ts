/**
 * A SIGNAL THAT DEPENDS ON SOMEBODY OPENING A SCREEN IS NOT A SIGNAL.
 *
 * Yesterday the queue learned to offer a known face first, because the
 * sweep's first action is a portrait and a candidate with no face turns the
 * whole sweep into "please send me a photo". This is the half of that change
 * which was missing, and it was missing quietly: the face cache had exactly
 * two writers -- the CRM screen's batch and the agent's own crm_client_face.
 * An owner who never opens that screen had `unknown` against every name, so
 * the ordering sorted nothing at all and the seller went on asking people
 * for photos it could have fetched itself.
 *
 * So the timer fills it, where ingest has just warmed the session. The
 * guards that matter are the ones about restraint and failure -- fetching
 * faces must never cost somebody their answer:
 *
 *   - it happens ONCE per sweep, after ingest, before the queue is read;
 *   - a scoped run (one person, opts.ingest === false) does not do it;
 *   - a failure is a warning, not a failed sweep;
 *   - a deps object without it sweeps exactly as before.
 */
import { describe, it, expect, vi } from 'vitest'
import { sweepOnce, resetProactiveForTests } from '@/services/crmProactive'

/*
 * The real reset, by its real name. The first draft of this file called
 * `forgetSweepStateForTests?.()` -- a function that does not exist, so the
 * optional call did nothing at all and every test ran on whatever state the
 * previous one left. A guard that cleans up with a name it invented is a
 * guard running in conditions nobody chose.
 */
import { beforeEach } from 'vitest'
beforeEach(() => resetProactiveForTests())

const OWNER = '900000001'

const deps = (over: Record<string, any> = {}) => ({
  ask: vi.fn(async () => ({ текст: 'тихо', инструменты: ['crm_leads'] })), // cyrillic-ok: agent answer fields
  ingest: vi.fn(async () => ({})),
  push: vi.fn(async () => undefined),
  leads: vi.fn(async () => []),
  ...over,
})

describe('the timer fills the faces', () => {
  it('asks for faces once, after the memory refresh', async () => {
    const order: string[] = []
    const d = deps({
      ingest: vi.fn(async () => {
        order.push('ingest')
        return {}
      }),
      faces: vi.fn(async () => {
        order.push('faces')
        return {}
      }),
    })
    await sweepOnce(OWNER, d as never)
    expect(order).toEqual(['ingest', 'faces'])
    expect(d.faces).toHaveBeenCalledTimes(1)
    expect(d.faces).toHaveBeenCalledWith(OWNER)
  })

  it('THE GUARD: a scoped run about one person fetches nobody', async () => {
    const d = deps({ faces: vi.fn(async () => ({})) })
    await sweepOnce(OWNER, d as never, {
      ingest: false,
      prompt: 'работай по 900000002', // cyrillic-ok: the scoped brief
    })
    expect(d.faces).not.toHaveBeenCalled()
  })

  it('THE GUARD: pictures that will not load do not fail the sweep', async () => {
    const d = deps({
      faces: vi.fn(async () => {
        throw new Error('FLOOD_WAIT_420')
      }),
    })
    const out = await sweepOnce(OWNER, d as never)
    expect(out.did).not.toBe('failed')
    // And the sweep went on to do its actual job.
    expect(d.leads).toHaveBeenCalled()
  })

  it('a deps object without it sweeps exactly as before', async () => {
    const d = deps()
    const out = await sweepOnce(OWNER, d as never)
    expect(out.did).not.toBe('failed')
    expect(d.leads).toHaveBeenCalled()
  })
})
