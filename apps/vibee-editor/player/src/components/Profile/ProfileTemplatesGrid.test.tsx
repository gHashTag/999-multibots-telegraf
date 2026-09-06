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

import { ProfileTemplatesGrid } from './ProfileTemplatesGrid'

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
})
