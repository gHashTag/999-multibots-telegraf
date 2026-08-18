/**
 * 🧪 Регрессия на построение URL аватара.
 *
 * Старый код на ветке без 'levels' делал
 *   `${avatar_url.split('.jpg')[0]}/levels/${step}.jpg`
 * то есть выдумывал каталог из имени файла. Замерено HEAD-запросами по всем
 * 15 ботам в проде: так построенный URL был живой в 0 случаях из 15, тогда как
 * сохранённый avatar_url отвечал 200 в 11 из 15.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const single = vi.fn()

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/core/bot/index', () => ({
  getBotNameByToken: () => ({ bot_name: 'neuro_blogger_bot' }),
}))

import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import type { MyContext } from '@/interfaces'

const ctx = { telegram: { token: 'tok' } } as unknown as MyContext

const withAvatar = (avatar_url: string | null) =>
  single.mockResolvedValue({ data: avatar_url ? { avatar_url } : null, error: null })

describe('getPhotoUrl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('URL со схемой levels — подставляет шаг', async () => {
    withAvatar(
      'https://x.supabase.co/storage/v1/object/public/landingpage/avatars/b/levels/1.jpg'
    )
    expect(await getPhotoUrl(ctx, 3)).toContain('levels/3.jpg')
  })

  it('обычный .jpg отдаётся как есть, а не превращается в каталог', async () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/landingpage/avatars/b/flux_pro_1.jpg'
    withAvatar(url)

    const got = await getPhotoUrl(ctx, 1)
    expect(got).toBe(url)
    expect(got).not.toContain('/levels/')
  })

  it('URL без .jpg не склеивается со строкой целиком', async () => {
    // Это реальное значение из прода: split('.jpg')[0] возвращал всю строку,
    // и получалось '...?text=AI/levels/1.jpg'.
    const url = 'https://via.placeholder.com/150/4A90E2/FFFFFF?text=AI'
    withAvatar(url)

    const got = await getPhotoUrl(ctx, 1)
    expect(got).toBe(url)
    expect(got).not.toContain('/levels/')
  })

  it('.png тоже не ломается', async () => {
    const url = 'https://example.com/lee_solarbot_avatar.png'
    withAvatar(url)
    expect(await getPhotoUrl(ctx, 2)).toBe(url)
  })

  it('без аватара — дефолт, а не падение', async () => {
    withAvatar(null)
    const got = await getPhotoUrl(ctx, 1)
    expect(got).toMatch(/^https:\/\//)
  })

  it('ошибка запроса — дефолт, а не исключение', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const got = await getPhotoUrl(ctx, 1)
    expect(got).toMatch(/^https:\/\//)
  })
})
