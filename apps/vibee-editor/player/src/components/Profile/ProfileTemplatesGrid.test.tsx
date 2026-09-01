import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  useTemplate: vi.fn(),
  editTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
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

  it('uses a feed-style video preview with poster, overlay metadata and owner actions', async () => {
    await renderGrid(true)

    const media = host.querySelector('.profile-templates__thumbnail')
    const video = media?.querySelector<HTMLVideoElement>('video')
    const actions = media?.querySelector('.profile-templates__social-actions')
    const meta = media?.querySelector('.profile-templates__meta')

    expect(video?.getAttribute('src')).toBe(
      'https://media.example.test/template.mp4'
    )
    expect(video?.getAttribute('poster')).toBe(
      'https://media.example.test/template.jpg'
    )
    expect(video?.autoplay).toBe(false)
    await act(async () => video?.dispatchEvent(new Event('loadedmetadata')))
    expect(video?.currentTime).toBe(0.8)
    expect(actions?.querySelectorAll('button')).toHaveLength(2)
    expect(meta?.textContent).toContain('Киноплёнка')
    expect(host.querySelector('.profile-templates__info')).toBeNull()
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
    expect(testState.navigate).not.toHaveBeenCalled()
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
