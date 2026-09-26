import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentFace } from './AgentFace'
import {
  forgetAgentAvatarsForTests,
  makeAgentAvatars,
  useAgentAvatars,
} from '@/hooks/useAgentAvatars'

/**
 * THE AGENTS' FACES (owner, 2026-09-26). Each case is a way a face could go
 * wrong on screen: a broken image icon, an empty circle before the avatars
 * are made, or a keeper's press that says "done" when nothing was drawn.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  forgetAgentAvatarsForTests()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('a face', () => {
  it('the avatar when there is one; the icon when there is none or it breaks', async () => {
    await act(async () =>
      root.render(<AgentFace icon="⎍" url="https://s3/rtl.png" />)
    )
    const img = host.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://s3/rtl.png')
    await act(async () => img.dispatchEvent(new Event('error')))
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toBe('⎍')
    await act(async () => root.render(<AgentFace icon="▦" />))
    expect(host.textContent).toBe('▦')
  })
})

describe('the avatars', () => {
  it('read once from the public route; nothing made is an empty map', async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ avatars: { rtl: 'u' } }))
    )
    vi.stubGlobal('fetch', f)
    // The hook's answer is rendered, not written to an outer variable.
    function Probe() {
      return <i data-seen={JSON.stringify(useAgentAvatars())} />
    }
    const seen = () =>
      JSON.parse(host.querySelector('i')?.getAttribute('data-seen') ?? '{}')
    await act(async () => root.render(<Probe />))
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(seen()).toEqual({ rtl: 'u' })
    expect(String(f.mock.calls[0][0])).toMatch(/\/api\/agents\/avatars$/)
  })

  it('a refused press is said as refused, never as done', async () => {
    const send = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              structuredContent: { done: false, reason: 'keeper only' },
            },
          })
        )
    ) as unknown as typeof fetch
    expect(await makeAgentAvatars('rtl', send)).toEqual({
      ok: false,
      text: 'keeper only',
    })
  })
})
