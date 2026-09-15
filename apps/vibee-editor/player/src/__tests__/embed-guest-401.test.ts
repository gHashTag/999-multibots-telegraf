import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * THE AGENT CHAT'S 401 IN THE TRI FRAME MEANS "SIGN IN", NOT "FAILED: 401".
 *
 * sendToAgent runs outside React (lib/agentStream.ts), so it marks the
 * document as needing a sign-in and the route gate
 * (components/Navigation/EmbedGuestGate.tsx) swaps the screen for the
 * sign-in panel. Outside embed, and for any other status, nothing changes.
 */

const embed = vi.hoisted(() => ({ on: true }))

vi.mock('@/lib/embed', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/embed')),
  get IS_EMBED() {
    return embed.on
  },
}))

import { sendToAgent } from '@/lib/agentStream'
import { embedSignInNeeded, forgetEmbedSignInNeeded } from '@/lib/embedGuest'

function answer(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      body: null,
      text: async () => '',
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetEmbedSignInNeeded()
  embed.on = true
})

describe('the agent chat in the TRI frame', () => {
  it('a 401 from /api/agent/chat marks the document as needing a sign-in', async () => {
    answer(401)
    await sendToAgent('hello')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(embedSignInNeeded()).toBe(true)
  })

  it('control: a 500 does not', async () => {
    answer(500)
    await sendToAgent('hello')
    expect(embedSignInNeeded()).toBe(false)
  })

  it('control: outside embed a 401 does not', async () => {
    embed.on = false
    answer(401)
    await sendToAgent('hello')
    expect(embedSignInNeeded()).toBe(false)
  })
})
