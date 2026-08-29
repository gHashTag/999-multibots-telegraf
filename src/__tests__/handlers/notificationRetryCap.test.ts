/**
 * A queued notification that cannot be delivered (e.g. the user blocked the bot)
 * must give up after a few tries. The processor selects with `.lt('attempts', 3)`,
 * so `attempts` has to actually increment on each failure.
 *
 * The old markMessageAsFailed set `attempts` to supabase.rpc('increment_attempts',
 * ...) — a query builder that was never awaited (the RPC never ran, and it is not
 * even defined) and was JSON-serialised into the PATCH body as an object for an
 * integer column, so the whole update failed and `attempts` never moved. The cap
 * never engaged and the message was retried every 60s forever. This pins that the
 * failure update now writes a concrete incremented number.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captured: { payload?: any } = {}

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: any) => {
        captured.payload = payload
        return { eq: async () => ({ error: null }) }
      },
    }),
    // A stand-in for the (non-existent) RPC: if the old code path is restored,
    // attempts becomes this object instead of a number, failing the assertions.
    rpc: () => ({ __isBuilder: true }),
  },
}))

import { NotificationHandler } from '@/handlers/notificationHandler'

function msg(attempts: number) {
  return {
    id: 'm1',
    telegram_id: '123',
    message: 'hi',
    message_type: 'info',
    created_at: '',
    priority: 'medium' as const,
    attempts,
    sent: false,
  }
}

describe('notification failure increments attempts to a concrete number', () => {
  beforeEach(() => {
    captured.payload = undefined
  })

  it('writes attempts = current + 1 as a number (so the 3-try cap can engage)', async () => {
    const handler = new NotificationHandler({} as any)
    await (handler as any).markMessageAsFailed(
      msg(1),
      new Error('403: blocked')
    )
    expect(typeof captured.payload.attempts).toBe('number')
    expect(captured.payload.attempts).toBe(2)
  })

  it('records the error text and a timestamp so the write actually persists', async () => {
    const handler = new NotificationHandler({} as any)
    await (handler as any).markMessageAsFailed(
      msg(2),
      new Error('403: blocked')
    )
    expect(captured.payload.attempts).toBe(3)
    expect(captured.payload.error).toContain('403')
    expect(typeof captured.payload.last_attempt).toBe('string')
  })
})
