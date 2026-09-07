import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatTaskActions } from './ChatTaskActions'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, params?: { task: string }) =>
      params ? `Open ${params.task}` : key.replace('chat.action.', ''),
  }),
}))

describe('contextual task actions in the conversation', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  function render(destinations?: string[]) {
    act(() =>
      root.render(
        <MemoryRouter>
          <ChatTaskActions destinations={destinations} />
        </MemoryRouter>
      )
    )
    return [...host.querySelectorAll('a')]
  }

  it('links directly to the named task screen with a readable label', () => {
    const links = render(['audio', 'editor'])
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/generate/audio',
      '/generate/editor',
    ])
    expect(links.map(link => link.textContent)).toEqual([
      'Open audio',
      'Open editor',
    ])
  })

  it('deduplicates, filters untrusted destinations and limits choice to two', () => {
    const links = render([
      'https://evil.test',
      'constructor',
      'files',
      'files',
      'plan',
      'chat',
    ])
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/profile?tab=files',
      '/profile?tab=plan',
    ])
  })

  it('has no empty container or generic menu when no actions were returned', () => {
    expect(render()).toEqual([])
    expect(host.innerHTML).toBe('')
  })
})
