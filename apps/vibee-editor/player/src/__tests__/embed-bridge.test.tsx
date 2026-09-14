import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE GAME LEARNS WHICH SCREEN THE FRAME IS ON FROM THESE MESSAGES.
 *
 * `ready` once on mount, `route` on every pathname change, the pathname only.
 * Outside embed nothing is posted at all.
 */

const embed = vi.hoisted(() => ({ on: false, posts: [] as string[][] }))

vi.mock('@/lib/embed', () => ({
  get IS_EMBED() {
    return embed.on
  },
  postToParent: (kind: string, path: string) => {
    embed.posts.push([kind, path])
  },
}))

import { EmbedBridge } from '@/components/Navigation/EmbedBridge'

let host: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  embed.posts = []
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  embed.on = false
})

function app() {
  root = createRoot(host)
  act(() =>
    root!.render(
      <MemoryRouter initialEntries={['/feed?post=abc']}>
        <EmbedBridge />
        <Routes>
          <Route path="/feed" element={<Link to="/crm/42?tab=x">go</Link>} />
          <Route path="/crm/:id" element={<p>crm</p>} />
        </Routes>
      </MemoryRouter>
    )
  )
  act(() => {
    host
      .querySelector('a')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      )
  })
}

describe('EmbedBridge', () => {
  it('posts ready, then route on navigation, pathname only', () => {
    embed.on = true
    app()
    expect(host.textContent).toBe('crm')
    expect(embed.posts).toEqual([
      ['ready', '/feed'],
      ['route', '/crm/42'],
    ])
  })

  it('posts nothing outside embed (control)', () => {
    app()
    expect(host.textContent).toBe('crm')
    expect(embed.posts).toEqual([])
  })
})
