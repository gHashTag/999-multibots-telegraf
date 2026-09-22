import { MemoryRouter } from 'react-router-dom'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ isOwn: true, profileLoaded: true }))

// Partial mock on purpose. ProfileTabs pulls in '@vibee/atoms', whose index
// builds real atoms with `atom`/`atomWithStorage` at import time. With one
// jotai in the tree (the dedupe of 2026-08-28) the mock covers that import
// too, and a mock without `atom` throws before the first render. The old
// full mock only worked while the atoms package had a second, unmocked copy.
vi.mock('jotai', async importOriginal => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: (target: symbol) => {
    if (target.description === 'viewedProfileAtom') {
      if (!state.profileLoaded) return null
      return {
        telegram_id: '27',
        username: 't27_dev',
        templates_count: 41,
        followers_count: 0,
        following_count: 0,
      }
    }
    if (target.description === 'followersAtom') return []
    if (target.description === 'followingAtom') return []
    return false
  },
  useSetAtom: () => vi.fn(),
}))

vi.mock('@/atoms', () => ({
  viewedProfileAtom: Symbol('viewedProfileAtom'),
  followersAtom: Symbol('followersAtom'),
  followersLoadingAtom: Symbol('followersLoadingAtom'),
  followingAtom: Symbol('followingAtom'),
  followingLoadingAtom: Symbol('followingLoadingAtom'),
  loadFollowersAtom: Symbol('loadFollowersAtom'),
  loadFollowingAtom: Symbol('loadFollowingAtom'),
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'profile.templates': 'Templates',
        'profile.followers': 'Followers',
        'profile.following': 'Following',
      })[key] ?? key,
  }),
}))

vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => {} }))
vi.mock('./useIsOwnProfile', () => ({
  useIsOwnProfile: () => state.isOwn,
}))
vi.mock('./ProfileTemplatesGrid', () => ({
  ProfileTemplatesGrid: () => <div>Templates grid</div>,
}))
vi.mock('./ProfilePlan', () => ({ ProfilePlan: () => <div>Plan grid</div> }))
vi.mock('./ProfileFilesGrid', () => ({
  ProfileFilesGrid: () => <div>Files grid</div>,
}))
vi.mock('./ProfileSkills', () => ({
  ProfileSkills: () => <div>Skills grid</div>,
}))
vi.mock('./ProfileBlog', () => ({ ProfileBlog: () => <div>Blog grid</div> }))
vi.mock('./SoulEditor', () => ({ SoulEditor: () => <div>SOUL editor</div> }))
vi.mock('./PairWithApp', () => ({
  PairWithApp: () => <div>Agent pairing</div>,
}))
vi.mock('./UserCard', () => ({ UserCard: () => <div>User card</div> }))
vi.mock('./profileTabCounts', () => ({ profileTabCount: () => null }))

import { ProfileTabs, revealInStrip } from './ProfileTabs'

describe('ProfileTabs owner workspace', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('restores SOUL.md and Agent as first-class owner tabs', async () => {
    state.isOwn = true
    await act(async () =>
      root.render(
        // Роутер обязателен: начальная вкладка читается из `?tab=` — так бот
        // приводит человека прямо на экран кода, а не на «Шаблоны».
        <MemoryRouter>
          <ProfileTabs />
        </MemoryRouter>
      )
    )

    const labels = [
      ...host.querySelectorAll<HTMLButtonElement>('.profile-tabs__tab'),
    ].map(button => button.textContent)

    expect(labels).toEqual([
      'Templates',
      // Раздел одобрения стоит сразу за роликами: то, что ждёт решения, не
      // должно лежать в конце ряда. Агент публикует сам, и без этого места
      // одобрять было бы негде — скрытый пост не виден больше нигде.
      'Ждут одобрения',
      'План',
      'Файлы',
      'Скиллы',
      'SOUL.md',
      'Агент',
      'Блог',
      'Followers',
      'Following',
    ])

    const soul = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent === 'SOUL.md'
    )
    await act(async () => soul?.click())
    expect(host.textContent).toContain('SOUL editor')

    const agent = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent === 'Агент'
    )
    await act(async () => agent?.click())
    expect(host.textContent).toContain('Agent pairing')
  })

  /*
   * The strip is laid out as a row of 100px cells, 90px wide, in a 300px
   * window: jsdom lays nothing out, so the geometry is given, and the strip's
   * scrollLeft is read through its setter.
   */
  function layOut(): { scrolledTo: () => number | null } {
    const strip = host.querySelector<HTMLElement>('.profile-tabs__header')!
    const tabs = [...host.querySelectorAll<HTMLElement>('.profile-tabs__tab')]
    let left = 0
    let set: number | null = null
    Object.defineProperty(strip, 'scrollLeft', {
      configurable: true,
      get: () => left,
      set: (v: number) => {
        left = v
        set = v
      },
    })
    strip.getBoundingClientRect = () =>
      ({ left: 0, right: 300, top: 0, bottom: 44 }) as DOMRect
    tabs.forEach((tab, i) => {
      tab.getBoundingClientRect = () =>
        ({
          left: i * 100 - left,
          right: i * 100 + 90 - left,
          top: 0,
          bottom: 44,
        }) as DOMRect
    })
    return { scrolledTo: () => set }
  }

  it('brings the chosen section into sight, and moves only the strip', async () => {
    state.isOwn = true
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProfileTabs />
        </MemoryRouter>
      )
    )
    const strip = layOut()
    const last = [
      ...host.querySelectorAll<HTMLButtonElement>('.profile-tabs__tab'),
    ].at(-1)!
    await act(async () => last.click())
    // The tenth tab ends at 990px; the 300px window scrolls to show it.
    expect(strip.scrolledTo()).toBe(990 - 300 + 16)
    expect(last.getAttribute('aria-pressed')).toBe('true')
  })

  it('a section named in the address is brought into sight once the profile arrives', async () => {
    // The bot links people straight to ?tab=...; the strip is not drawn until
    // the profile has loaded, so the first pass had nothing to scroll.
    state.isOwn = true
    state.profileLoaded = false
    const tree = () => (
      <MemoryRouter initialEntries={['/profile?tab=following']}>
        <ProfileTabs />
      </MemoryRouter>
    )
    try {
      await act(async () => root.render(tree()))
      expect(host.querySelector('.profile-tabs__tab')).toBeNull()
      state.profileLoaded = true
      // The strip is drawn now; lay it out before the effect reads it.
      const original = HTMLElement.prototype.getBoundingClientRect
      const scrolls: number[] = []
      const scrollDesc = Object.getOwnPropertyDescriptor(
        Element.prototype,
        'scrollLeft'
      )
      HTMLElement.prototype.getBoundingClientRect = function (
        this: HTMLElement
      ) {
        if (this.classList.contains('profile-tabs__header'))
          return { left: 0, right: 300, top: 0, bottom: 44 } as DOMRect
        const all = [...(this.parentElement?.children ?? [])]
        const i = all.indexOf(this)
        return {
          left: i * 100,
          right: i * 100 + 90,
          top: 0,
          bottom: 44,
        } as DOMRect
      }
      Object.defineProperty(Element.prototype, 'scrollLeft', {
        configurable: true,
        get: () => 0,
        set: (v: number) => void scrolls.push(v),
      })
      try {
        await act(async () => root.render(tree()))
      } finally {
        HTMLElement.prototype.getBoundingClientRect = original
        if (scrollDesc)
          Object.defineProperty(Element.prototype, 'scrollLeft', scrollDesc)
      }
      const active = host.querySelector('.profile-tabs__tab--active')
      expect(active?.textContent).toContain('Following')
      // "Following" is the tenth: it ends at 990px.
      expect(scrolls.at(-1)).toBe(990 - 300 + 16)
    } finally {
      state.profileLoaded = true
    }
  })

  it('keeps private workspace tabs hidden on somebody else profile', async () => {
    state.isOwn = false
    await act(async () =>
      root.render(
        // Роутер обязателен: начальная вкладка читается из `?tab=` — так бот
        // приводит человека прямо на экран кода, а не на «Шаблоны».
        <MemoryRouter>
          <ProfileTabs />
        </MemoryRouter>
      )
    )

    expect(host.textContent).not.toContain('План')
    expect(host.textContent).not.toContain('Файлы')
    expect(host.textContent).not.toContain('Скиллы')
    expect(host.textContent).not.toContain('SOUL.md')
    expect(host.textContent).not.toContain('Агент')
  })
})

describe('revealInStrip', () => {
  function strip(scrollLeft = 0) {
    const el = {
      scrollLeft,
      getBoundingClientRect: () => ({ left: 0, right: 300 }),
    }
    return el as unknown as HTMLElement
  }
  const item = (left: number, right: number) =>
    ({
      getBoundingClientRect: () => ({ left, right }),
    }) as unknown as HTMLElement

  it('scrolls right to a tab past the right edge, with a margin', () => {
    const s = strip()
    revealInStrip(s, item(280, 380))
    expect(s.scrollLeft).toBe(96)
  })

  it('scrolls left to a tab past the left edge', () => {
    const s = strip(200)
    revealInStrip(s, item(-50, 40))
    expect(s.scrollLeft).toBe(134)
  })

  it('leaves the strip alone when the tab is already in sight', () => {
    const s = strip(40)
    revealInStrip(s, item(10, 120))
    expect(s.scrollLeft).toBe(40)
  })
})
