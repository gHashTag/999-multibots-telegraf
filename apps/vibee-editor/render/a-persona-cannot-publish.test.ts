/**
 * A PERSONA'S "LET US PUBLISH" PUBLISHES NOTHING.
 *
 * Duet duet-mub68idg, 2026-09-21: the buyer model -- a persona playing the
 * client -- said "let us publish it as a trial", and the seller called
 * feed_publish twice. The hidden-by-default gate held, but a persona's line is
 * not the client's approval (gHashTag/t27#4522 PERSONA_CONSENT_IS_NOT_CONSENT).
 *
 * The duet now denies feed_publish on every turn. The promise is "refused, and
 * nothing is written", and that is a property of the DISPATCHER -- whether the
 * handler runs at all -- so it is proved through the dispatcher itself, with a
 * pool and a network that record everything, and a control that shows the
 * same call outside the ban does reach both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { dispatchToolCall, DENIED_DEFAULT_REASON } from './src/agent/chat'
import { toOpenAITools, type ToolContext } from './src/agent/tools'
import {
  deniedToolsFor,
  refusedOf,
  DUET_DENY_REASONS,
  DISCOVERY_SELLER_TURNS,
} from './src/agent/crm-duet-tool'

const SELLER = '900000061'
const PUBLISH = {
  function: {
    name: 'feed_publish',
    arguments: JSON.stringify({
      name: 'План 6 — проба',
      description: 'Пробный ролик по плану 6 #leela',
      video_url: 'https://bucket.example/renders/leela-plan-6.mp4',
    }),
  },
}

function recording() {
  const queries: string[] = []
  const ctx = {
    telegramId: SELLER,
    pool: {
      query: async (sql: string) => {
        queries.push(sql)
        return { rows: [{ n: 'Author', un: '' }] }
      },
    },
  } as unknown as ToolContext
  const fetched = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: 80, template: { created_at: 't' } }), {
        status: 200,
      })
  )
  vi.stubGlobal('fetch', fetched)
  return { ctx, queries, fetched }
}

async function drain(gen: AsyncGenerator<unknown, unknown, void>) {
  for (;;) {
    const step = await gen.next()
    if (step.done) return step.value as Record<string, unknown>
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('feed_publish in a duet', () => {
  it('is refused on every seller turn, with a reason the model can read, and nothing is read, written or sent', async () => {
    for (const turn of [0, DISCOVERY_SELLER_TURNS, 7]) {
      const { ctx, queries, fetched } = recording()
      const value = await drain(
        dispatchToolCall(PUBLISH, ctx, {
          denyTools: deniedToolsFor(turn),
          denyReasons: DUET_DENY_REASONS,
        })
      )
      expect(refusedOf(value), `turn ${turn}`).toBe(true)
      expect(String(value['ошибка'])).toContain('не одобрение клиента') // cyrillic-ok: tool result key
      expect(queries, `turn ${turn}`).toEqual([])
      expect(fetched, `turn ${turn}`).not.toHaveBeenCalled()
    }
  })

  it('is not even offered to the model after discovery', () => {
    const offered = toOpenAITools(undefined, deniedToolsFor(5)).map(
      t => t.function.name
    )
    expect(offered).not.toContain('feed_publish')
    // The ban is narrow: the paid reel is offered again after discovery.
    expect(offered).toContain('reel_render')
  })

  it('CONTROL: outside the ban the same call reaches the database and the publish route', async () => {
    const { ctx, queries, fetched } = recording()
    const value = await drain(dispatchToolCall(PUBLISH, ctx))
    expect(refusedOf(value)).toBe(false)
    expect(queries.length).toBeGreaterThan(0)
    expect(fetched).toHaveBeenCalled()
  })

  it('a discovery refusal of a paid tool keeps its own reason', async () => {
    const { ctx } = recording()
    const value = await drain(
      dispatchToolCall(
        { function: { name: 'reel_render', arguments: '{}' } },
        ctx,
        { denyTools: deniedToolsFor(0), denyReasons: DUET_DENY_REASONS }
      )
    )
    expect(refusedOf(value)).toBe(true)
    expect(String(value['ошибка'])).toContain(DENIED_DEFAULT_REASON) // cyrillic-ok: tool result key
  })
})
