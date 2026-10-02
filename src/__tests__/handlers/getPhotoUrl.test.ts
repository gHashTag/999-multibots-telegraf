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

import { getPhotoUrl, DEFAULT_BOT_PHOTO_URL } from '@/handlers/getPhotoUrl'
import type { MyContext } from '@/interfaces'

const ctx = { telegram: { token: 'tok' } } as unknown as MyContext

const withAvatar = (avatar_url: string | null) =>
  single.mockResolvedValue({
    data: avatar_url ? { avatar_url } : null,
    error: null,
  })

describe('getPhotoUrl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a stored levels URL is returned as stored, no step is invented', async () => {
    // levels/2..22.jpg never existed on any host; substituting a step was the
    // one way this function produced a dead address.
    const url =
      'https://x.supabase.co/storage/v1/object/public/landingpage/avatars/b/levels/1.jpg'
    withAvatar(url)
    expect(await getPhotoUrl(ctx)).toBe(url)
  })

  it('обычный .jpg отдаётся как есть, а не превращается в каталог', async () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/landingpage/avatars/b/flux_pro_1.jpg'
    withAvatar(url)

    const got = await getPhotoUrl(ctx)
    expect(got).toBe(url)
    expect(got).not.toContain('/levels/')
  })

  it('URL без .jpg не склеивается со строкой целиком', async () => {
    // Это реальное значение из прода: split('.jpg')[0] возвращал всю строку,
    // и получалось '...?text=AI/levels/1.jpg'.
    const url = 'https://via.placeholder.com/150/4A90E2/FFFFFF?text=AI'
    withAvatar(url)

    const got = await getPhotoUrl(ctx)
    expect(got).toBe(url)
    expect(got).not.toContain('/levels/')
  })

  it('.png тоже не ломается', async () => {
    const url = 'https://example.com/lee_solarbot_avatar.png'
    withAvatar(url)
    expect(await getPhotoUrl(ctx)).toBe(url)
  })

  it('без аватара — дефолт, а не падение', async () => {
    withAvatar(null)
    expect(await getPhotoUrl(ctx)).toBe(DEFAULT_BOT_PHOTO_URL)
  })

  it('ошибка запроса — дефолт, а не исключение', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await getPhotoUrl(ctx)).toBe(DEFAULT_BOT_PHOTO_URL)
  })

  it('the default is the one level picture that exists, on our storage', () => {
    expect(DEFAULT_BOT_PHOTO_URL).toBe(
      'https://supabase-gateway-production-122d.up.railway.app/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/levels/1.jpg'
    )
  })
})
