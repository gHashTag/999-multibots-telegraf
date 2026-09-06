import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ isOwn: true }))

vi.mock('jotai', () => ({
  useAtomValue: (target: symbol) => {
    if (target.description === 'viewedProfileAtom') {
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

import { ProfileTabs } from './ProfileTabs'

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
    await act(async () => root.render(<ProfileTabs />))

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

  it('keeps private workspace tabs hidden on somebody else profile', async () => {
    state.isOwn = false
    await act(async () => root.render(<ProfileTabs />))

    expect(host.textContent).not.toContain('План')
    expect(host.textContent).not.toContain('Файлы')
    expect(host.textContent).not.toContain('Скиллы')
    expect(host.textContent).not.toContain('SOUL.md')
    expect(host.textContent).not.toContain('Агент')
  })
})
