import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryCard } from './StoryCard'

/**
 * THE DOOR TO /STORY, PINNED.
 *
 * The page itself worked for anyone whose seller set the template -- and had
 * no link anywhere in the cabinet (2026-09-29): only the bot's deep link
 * reached it. What is pinned here is the door: on the viewer's own profile it
 * leads to /story, and on a stranger's profile it is not there at all, the
 * same rule the CRM card holds.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// The newest reels that came out (plan-reel previews_shown), as the server says.
const mine = vi.hoisted(() => ({
  jobs: [] as Array<{
    id: number
    topic: string
    status: string
    url: string | null
  }>,
}))
vi.mock('@/lib/crm', () => ({
  loadMyStory: async () => ({ reachable: true, data: { jobs: mine.jobs } }),
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'story.card.title': 'Мои рилсы-истории',
        'story.card.note': 'Моё лицо, мой голос, любая тема',
        'story.card.open': 'Открыть рилсы',
      })[key] ?? key,
  }),
}))

describe('the story-reels card', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  const show = async (isOwn: boolean) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoryCard isOwn={isOwn} />
        </MemoryRouter>
      )
    })
  }

  it('on my profile the door leads to /story', async () => {
    mine.jobs = []
    await show(true)
    const link = host.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/story')
    expect(link?.textContent).toContain('Открыть рилсы')
  })

  it("on somebody else's profile there is no door", async () => {
    await show(false)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toBe('')
  })

  it('shows the newest three reels that came out, as pictures', async () => {
    mine.jobs = [
      {
        id: 6,
        topic: 'f',
        status: 'done',
        url: 'https://bucket.example/6.mp4',
      },
      { id: 5, topic: 'e', status: 'running', url: null },
      {
        id: 4,
        topic: 'd',
        status: 'done',
        url: 'https://bucket.example/4.mp4',
      },
      { id: 3, topic: 'c', status: 'failed', url: null },
      {
        id: 2,
        topic: 'b',
        status: 'done',
        url: 'https://bucket.example/2.mp4',
      },
      {
        id: 1,
        topic: 'a',
        status: 'done',
        url: 'https://bucket.example/1.mp4',
      },
    ]
    await show(true)
    await act(async () => undefined)
    const pics = [...host.querySelectorAll<HTMLAnchorElement>('a.reel-preview')]
    expect(pics.map(a => a.getAttribute('href'))).toEqual([
      'https://bucket.example/6.mp4',
      'https://bucket.example/4.mp4',
      'https://bucket.example/2.mp4',
    ])
    // The door to /story is still there, after the pictures.
    expect(host.querySelector('a[href="/story"]')).not.toBeNull()
  })
})
