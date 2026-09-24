import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * THE COMPACT AUTO SWITCH.
 *
 * Pinned: it is not drawn for somebody the server will not answer (not a
 * seller), and pressing it keeps the owner's scope -- a chip in the chat must
 * never turn "only the people I picked" into "everyone".
 */
let status: Record<string, unknown> | null = null
let setArgs: Record<string, unknown> | null = null
vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = body?.params?.name
    if (!status) return new Response('no', { status: 403 })
    if (name === 'autopilot_set') {
      setArgs = body.params.arguments
      status = { ...status, on: setArgs?.on === true }
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: status },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  })
)

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  setArgs = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function show() {
  const { AutoChip } = await import('./AutoChip')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AutoChip />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('AutoChip', () => {
  it('draws nothing when the switch cannot be read', async () => {
    status = null
    await show()
    expect(host.querySelector('.auto-chip')).toBeNull()
  })

  it('turns on with the scope the owner chose, not "everyone"', async () => {
    status = { on: false, scope: 'chosen', chosen: 2, left_today: 20, cap: 20 }
    await show()
    expect(host.textContent).toContain('autoChip.off')
    await act(async () => {
      ;(host.querySelector('.auto-chip__flip') as HTMLButtonElement).click()
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(setArgs).toEqual({ on: true, scope: 'chosen' })
    expect(host.querySelector('.auto-chip--on')).not.toBeNull()
  })
})
