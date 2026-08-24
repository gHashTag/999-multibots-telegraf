import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyAgentButton } from './CopyAgentButton'

describe('CopyAgentButton SAFE BETA boundary', () => {
  let host: HTMLDivElement
  let root: Root
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard'
    )
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    if (clipboardDescriptor)
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.restoreAllMocks()
  })

  it('keeps external MCP onboarding release-blocked without touching clipboard', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    await act(async () => root.render(<CopyAgentButton />))

    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(true)
    button.click()

    expect(writeText).not.toHaveBeenCalled()
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'временно недоступно'
    )
    expect(host.innerHTML).not.toMatch(
      /TRINITY_MCP_KEY|X-Agent-Key|trinity_mcp_|initData|curl|config\.toml/i
    )
  })
})
