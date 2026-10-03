import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  useTemplate: vi.fn(),
  editTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  intersectionCallbacks: [] as IntersectionObserverCallback[],
  observedTargets: [] as Element[],
  autoIntersect: false,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => testState.navigate,
}))

vi.mock('jotai', () => ({
  useAtomValue: () => ({ id: 27 }),
  useSetAtom: (target: symbol) => {
    if (target.description === 'useTemplateAtom') return testState.useTemplate
    if (target.description === 'editTemplateAtom') return testState.editTemplate
    if (target.description === 'deleteTemplateAtom')
      return testState.deleteTemplate
    throw new Error(`unexpected atom: ${String(target)}`)
  },
}))

vi.mock('@/atoms', () => ({
  userAtom: Symbol('userAtom'),
  useTemplateAtom: Symbol('useTemplateAtom'),
  editTemplateAtom: Symbol('editTemplateAtom'),
  deleteTemplateAtom: Symbol('deleteTemplateAtom'),
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'profile.edit_template': 'Редактировать',
        'profile.delete_template': 'Удалить',
        'profile.preview_template': 'Воспроизвести',
        'profile.pause_preview': 'Пауза',
        'profile.delete_template_confirm': 'Удалить шаблон?',
        'profile.template_action_failed': 'Не удалось изменить шаблон.',
        'common.cancel': 'Отмена',
        'common.delete': 'Удалить',
      })[key] ?? key,
  }),
}))

vi.mock('../../config', () => ({ API_BASE: 'https://api.example.test' }))

import { AUTO_PAGES, ProfileTemplatesGrid } from './ProfileTemplatesGrid'

const template = {
  id: 39,
  telegramId: 27,
  name: 'Киноплёнка',
  description: 'Шесть сцен',
  thumbnailUrl: 'https://media.example.test/template.jpg',
  videoUrl: 'https://media.example.test/template.mp4',
  viewsCount: 8,
  likesCount: 2,
}

const secondTemplate = {
  ...template,
  id: 40,
  name: 'Вторая сцена',
  videoUrl: 'https://media.example.test/second.mp4',
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('ProfileTemplatesGrid owner actions', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    testState.navigate.mockReset()
    testState.useTemplate.mockReset().mockResolvedValue(true)
    testState.editTemplate.mockReset().mockResolvedValue(true)
    testState.deleteTemplate.mockReset().mockResolvedValue(undefined)
    testState.intersectionCallbacks.length = 0
    testState.observedTargets.length = 0
    testState.autoIntersect = false
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private callback: IntersectionObserverCallback

        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback
          testState.intersectionCallbacks.push(callback)
        }

        observe(target: Element) {
          testState.observedTargets.push(target)
          if (testState.autoIntersect) {
            queueMicrotask(() =>
              this.callback(
                [
                  {
                    target,
                    isIntersecting: true,
                    intersectionRatio: 1,
                  } as IntersectionObserverEntry,
                ],
                this as unknown as IntersectionObserver
              )
            )
          }
        }

        unobserve() {}
        disconnect() {}
      }
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ templates: [template] }),
      })
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  async function renderGrid(isOwn: boolean) {
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="t27_dev" isOwn={isOwn} />)
    })
    await act(async () => Promise.resolve())
    /*
     * ГРУППЫ СВЁРНУТЫ — РАСКРЫВАЕМ, как это делает человек.
     *
     * Вкладка называется «Шаблоны» и показывает шаблоны: у владельца 46
     * роликов на три шаблона, и стена карточек — то, из-за чего всё и
     * переделывалось.
     *
     * Раньше здесь была поблажка «одну группу не сворачиваем», и я вывел её
     * ИЗ ЭТИХ ПАДАВШИХ ТЕСТОВ, а не из данных. На живом профиле первая
     * страница — двадцать роликов одного шаблона, то есть ровно одна группа,
     * то есть снова стена. Правильный ответ был не в поблажке, а здесь.
     */
    await act(async () => {
      host
        .querySelectorAll<HTMLElement>('.profile-templates__group-head')
        .forEach(кнопка => кнопка.click())
    })
    await act(async () => Promise.resolve())
  }

  async function reveal(target: Element) {
    const callback = testState.intersectionCallbacks.at(-1)
    expect(callback).toBeDefined()
    await act(async () =>
      callback?.(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    )
  }

  it('shows edit/delete only to the verified profile owner and does not hijack the card click', async () => {
    await renderGrid(false)

    expect(
      host.querySelector('[aria-label="Редактировать Киноплёнка"]')
    ).toBeNull()
    expect(host.querySelector('[aria-label="Удалить Киноплёнка"]')).toBeNull()

    await act(async () => {
      host.querySelector<HTMLElement>('.profile-templates__item')?.click()
    })
    expect(testState.navigate).not.toHaveBeenCalled()
  })

  it('uses a cheap poster until Play, with overlay metadata and owner actions', async () => {
    await renderGrid(true)

    const media = host.querySelector('.profile-templates__thumbnail')
    const video = media?.querySelector<HTMLVideoElement>('video')
    const poster = media?.querySelector<HTMLImageElement>('img')
    const actions = media?.querySelector('.profile-templates__social-actions')
    const meta = media?.querySelector('.profile-templates__meta')

    expect(video?.getAttribute('src')).toBe(
      'https://media.example.test/template.mp4'
    )
    expect(video?.getAttribute('poster')).toBe(
      'https://media.example.test/template.jpg'
    )
    expect(video?.preload).toBe('none')
    expect(video?.autoplay).toBe(false)
    await act(async () => video?.dispatchEvent(new Event('loadedmetadata')))
    expect(video?.currentTime).toBe(0)
    expect(poster?.getAttribute('src')).toBe(
      'https://media.example.test/template.jpg'
    )
    expect(actions?.querySelectorAll('button')).toHaveLength(2)
    expect(meta?.textContent).toContain('Киноплёнка')
    expect(host.querySelector('.profile-templates__info')).toBeNull()
  })

  it('loads and seeks a posterless preview only when its card nears the viewport', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [{ ...template, thumbnailUrl: null }],
      }),
    } as Response)
    await renderGrid(true)

    const video = host.querySelector<HTMLVideoElement>('video')
    const media = host.querySelector('.profile-templates__thumbnail')
    expect(video?.preload).toBe('none')
    expect(video?.autoplay).toBe(false)
    await act(async () => video?.dispatchEvent(new Event('loadedmetadata')))
    expect(video?.currentTime).toBe(0)

    await reveal(media as Element)
    expect(video?.preload).toBe('metadata')
    await act(async () => video?.dispatchEvent(new Event('loadedmetadata')))
    expect(video?.currentTime).toBe(0.8)
  })

  it('does not re-observe or re-render-loop when an observer auto-reports the same card', async () => {
    testState.autoIntersect = true
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [{ ...template, thumbnailUrl: null }],
      }),
    } as Response)

    await renderGrid(true)
    await act(async () => Promise.resolve())

    expect(testState.observedTargets).toHaveLength(1)
    expect(host.querySelector<HTMLVideoElement>('video')?.preload).toBe(
      'metadata'
    )
  })

  it('keeps the no-observer geometry fallback bounded and idempotent', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.stubGlobal('requestAnimationFrame', undefined)
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        top: 100,
        bottom: 400,
        left: 0,
        right: 160,
        width: 160,
        height: 300,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      })
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [{ ...template, thumbnailUrl: null }],
      }),
    } as Response)

    await renderGrid(true)
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)))

    expect(host.querySelector<HTMLVideoElement>('video')?.preload).toBe(
      'metadata'
    )
    expect(bounds.mock.calls.length).toBeLessThan(6)
    bounds.mockRestore()
  })

  it('falls back from a broken video to its poster and then to a placeholder', async () => {
    await renderGrid(true)

    const media = host.querySelector('.profile-templates__thumbnail')
    const video = media?.querySelector<HTMLVideoElement>('video')
    expect(video).not.toBeNull()

    await act(async () => video?.dispatchEvent(new Event('error')))
    const poster = media?.querySelector<HTMLImageElement>('img')
    expect(poster?.getAttribute('src')).toBe(
      'https://media.example.test/template.jpg'
    )

    await act(async () => poster?.dispatchEvent(new Event('error')))
    expect(
      media?.querySelector('.profile-templates__placeholder')
    ).not.toBeNull()
  })

  it('plays the inline preview without navigating away from the profile', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    await renderGrid(true)

    const preview = host.querySelector<HTMLButtonElement>(
      '[aria-label="Воспроизвести Киноплёнка"]'
    )
    expect(preview).not.toBeNull()

    await act(async () => preview?.click())

    expect(play).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[aria-label="Пауза Киноплёнка"]')).not.toBeNull()
    expect(testState.navigate).not.toHaveBeenCalled()
    play.mockRestore()
  })

  it('cancels a pending same-card play on a rapid second activation', async () => {
    const pendingPlay = deferred<void>()
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockReturnValue(pendingPlay.promise)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    await renderGrid(true)

    const preview = host.querySelector<HTMLButtonElement>(
      '[aria-label="Воспроизвести Киноплёнка"]'
    )
    await act(async () => preview?.click())
    expect(host.querySelector('[aria-label="Пауза Киноплёнка"]')).not.toBeNull()

    await act(async () => preview?.click())
    expect(
      host.querySelector('[aria-label="Воспроизвести Киноплёнка"]')
    ).not.toBeNull()
    expect(pause).toHaveBeenCalledTimes(1)

    await act(async () => pendingPlay.resolve())
    expect(pause).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[aria-label="Пауза Киноплёнка"]')).toBeNull()
    play.mockRestore()
    pause.mockRestore()
  })

  it('keeps only the newest preview selected when play promises resolve out of order', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ templates: [template, secondTemplate] }),
    } as Response)
    const firstPlay = deferred<void>()
    const secondPlay = deferred<void>()
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        return this.getAttribute('src')?.includes('second')
          ? secondPlay.promise
          : firstPlay.promise
      })
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    await renderGrid(true)

    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Воспроизвести Киноплёнка"]'
        )
        ?.click()
    )
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Воспроизвести Вторая сцена"]'
        )
        ?.click()
    )
    await act(async () => secondPlay.resolve())
    await act(async () => firstPlay.resolve())

    expect(host.querySelector('[aria-label="Пауза Киноплёнка"]')).toBeNull()
    expect(
      host.querySelector('[aria-label="Пауза Вторая сцена"]')
    ).not.toBeNull()
    expect(pause).toHaveBeenCalled()
    play.mockRestore()
    pause.mockRestore()
  })

  it('returns to Play when the browser pauses the active preview', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    await renderGrid(true)

    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Воспроизвести Киноплёнка"]'
        )
        ?.click()
    )
    const video = host.querySelector<HTMLVideoElement>('video')
    await act(async () => video?.dispatchEvent(new Event('pause')))

    expect(
      host.querySelector('[aria-label="Воспроизвести Киноплёнка"]')
    ).not.toBeNull()
    expect(host.querySelector('[aria-label="Пауза Киноплёнка"]')).toBeNull()
    play.mockRestore()
  })

  it('loads the original owner template and opens the editor only after success', async () => {
    await renderGrid(true)

    const edit = host.querySelector<HTMLButtonElement>(
      '[aria-label="Редактировать Киноплёнка"]'
    )
    expect(edit).not.toBeNull()

    await act(async () => edit?.click())

    expect(testState.editTemplate).toHaveBeenCalledWith(39)
    expect(testState.navigate).toHaveBeenCalledWith('/editor')
  })

  it('stays on the profile when owner authentication or template loading fails', async () => {
    testState.editTemplate.mockRejectedValueOnce(new Error('unauthorized'))
    await renderGrid(true)

    const edit = host.querySelector<HTMLButtonElement>(
      '[aria-label="Редактировать Киноплёнка"]'
    )
    await act(async () => edit?.click())

    expect(testState.navigate).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Не удалось'
    )
  })

  it('requires confirmation before a reversible owner-only delete and removes the card after success', async () => {
    await renderGrid(true)

    const remove = host.querySelector<HTMLButtonElement>(
      '[aria-label="Удалить Киноплёнка"]'
    )
    expect(remove).not.toBeNull()

    await act(async () => remove?.click())
    expect(testState.deleteTemplate).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull()

    const confirm = host.querySelector<HTMLButtonElement>(
      '[data-action="confirm-delete"]'
    )
    await act(async () => confirm?.click())

    expect(testState.deleteTemplate).toHaveBeenCalledWith(39)
    expect(host.textContent).not.toContain('Киноплёнка')
  })

  /*
   * "The templates screen shakes and blinks" (owner, 2026-10-03): the
   * placeholder was three phone screens of 9:16 tiles that gave way to
   * one-line group heads, and the Load More button flipped once a page while
   * the pages read themselves.
   */
  it('holds the place with group heads, not tall tiles, while the first page loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    )
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="t27_dev" isOwn />)
    })
    const held = host.querySelector('[data-testid="templates-placeholder"]')
    expect(
      held?.querySelectorAll('.profile-templates__group-head')
    ).toHaveLength(3)
    expect(host.innerHTML).not.toContain('9/16')
  })

  it('shows no Load More while the pages read themselves, and shows it past the fuse', async () => {
    const page1 = deferred<unknown>()
    const pageOf = (url: string) => Number(/page=(\d+)/.exec(url)?.[1] ?? 0)
    const full = (n: number) => ({
      ok: true,
      json: async () => ({
        templates: Array.from({ length: 20 }, (_, i) => ({
          ...template,
          id: 1000 + n * 20 + i,
        })),
      }),
    })
    const fetchMock = vi.fn((url: string) =>
      pageOf(url) === 1 ? page1.promise : Promise.resolve(full(pageOf(url)))
    )
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="t27_dev" isOwn />)
    })
    await act(async () => Promise.resolve())
    expect(host.querySelector('.profile-templates__group-head')).not.toBeNull()
    expect(host.querySelector('.profile-templates__load-more')).toBeNull()

    await act(async () => page1.resolve(full(1)))
    for (let i = 0; i < AUTO_PAGES * 2; i++)
      await act(async () => Promise.resolve())
    expect(fetchMock).toHaveBeenCalledTimes(AUTO_PAGES)
    expect(
      host.querySelector('.profile-templates__load-more')?.textContent
    ).toBe('profile.load_more')
  })

  it('a failed page stops the automatic reading instead of asking for it again and again', async () => {
    let page1Fails = true
    const fetchMock = vi.fn(async (url: string) => {
      const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 0)
      if (n === 1 && page1Fails) return { ok: false, json: async () => ({}) }
      return {
        ok: true,
        json: async () => ({
          templates: Array.from({ length: n === 0 ? 20 : 3 }, (_, i) => ({
            ...template,
            id: 2000 + n * 20 + i,
          })),
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="t27_dev" isOwn />)
    })
    for (let i = 0; i < 20; i++) await act(async () => Promise.resolve())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const retry = host.querySelector<HTMLButtonElement>(
      '.profile-templates__load-more'
    )
    expect(retry?.textContent).toBe('profile.load_more')
    page1Fails = false
    await act(async () => retry?.click())
    for (let i = 0; i < 5; i++) await act(async () => Promise.resolve())
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(host.querySelector('.profile-templates__load-more')).toBeNull()
  })

  it('a failed first page is an error with a retry, not "no templates"', async () => {
    let fails = true
    const pages: number[] = []
    const fetchMock = vi.fn(async (url: string) => {
      const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 0)
      pages.push(n)
      if (fails) throw new Error('offline')
      return {
        ok: true,
        json: async () => ({ templates: [{ ...template, id: 3000 }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="t27_dev" isOwn />)
    })
    for (let i = 0; i < 10; i++) await act(async () => Promise.resolve())
    expect(pages).toEqual([0])
    expect(host.textContent).not.toContain('profile.no_templates')
    const failed = host.querySelector('[data-testid="templates-failed"]')
    expect(failed?.textContent).toContain('profile.templates_failed')

    fails = false
    await act(async () => failed?.querySelector('button')?.click())
    for (let i = 0; i < 10; i++) await act(async () => Promise.resolve())
    expect(pages).toEqual([0, 0])
    expect(host.querySelector('[data-testid="templates-failed"]')).toBeNull()
    expect(host.querySelector('.profile-templates')).not.toBeNull()
  })

  it("another username does not keep the previous profile's templates", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/users/first/')
        ? {
            ok: true,
            json: async () => ({ templates: [{ ...template, id: 4000 }] }),
          }
        : { ok: false, json: async () => ({}) }
    )
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      root.render(<ProfileTemplatesGrid username="first" isOwn />)
    })
    for (let i = 0; i < 10; i++) await act(async () => Promise.resolve())
    expect(host.querySelector('.profile-templates')).not.toBeNull()

    await act(async () => {
      root.render(<ProfileTemplatesGrid username="second" isOwn />)
    })
    for (let i = 0; i < 10; i++) await act(async () => Promise.resolve())
    expect(host.querySelector('.profile-templates')).toBeNull()
    expect(
      host.querySelector('[data-testid="templates-failed"]')
    ).not.toBeNull()
  })
})
