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
import { editorStore } from '@/atoms/Provider'
import { agentMessagesAtomFor } from '@/atoms/agentChat'
import {
  closeLoginAtom,
  loginReasonAtom,
  showLoginModalAtom,
} from '@/atoms/user'

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
  editorStore.set(closeLoginAtom)
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

/*
 * Outside the frame the same 401 is a browser with no session: the welcome
 * screen's "Try it first" link, opened outside Telegram. It used to print the
 * server's JSON into the bubble -- `Не получилось: 401. {"error":...}` -- and
 * offer no way in.
 */
describe('the agent chat in a plain browser', () => {
  it('a 401 opens the sign-in card at the chat door', async () => {
    embed.on = false
    answer(401)
    await sendToAgent('hello', [], { agent: 'blogger' })
    expect(editorStore.get(showLoginModalAtom)).toBe(true)
    expect(editorStore.get(loginReasonAtom)).toBe('chat')
  })

  it('the bubble says it in words, not the raw status', async () => {
    embed.on = false
    answer(401)
    await sendToAgent('hi there', [], { agent: 'blogger' })
    const thread = editorStore.get(agentMessagesAtomFor(null, 'blogger', null))
    const last = thread[thread.length - 1]
    expect(last.role).not.toBe('user')
    expect(last.text).not.toMatch(/401|\{/)
    expect(last.text).toMatch(/Telegram/)
  })

  it('control: a 500 does not open the card', async () => {
    embed.on = false
    answer(500)
    await sendToAgent('again', [], { agent: 'blogger' })
    expect(editorStore.get(showLoginModalAtom)).toBe(false)
  })

  it('control: inside the frame the route gate answers, not the card', async () => {
    answer(401)
    await sendToAgent('frame', [], { agent: 'blogger' })
    expect(embedSignInNeeded()).toBe(true)
    expect(editorStore.get(showLoginModalAtom)).toBe(false)
  })
})
