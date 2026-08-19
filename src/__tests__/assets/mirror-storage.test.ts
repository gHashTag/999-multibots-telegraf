/**
 * Зеркалирование чужих ссылок: контракт mirrorToOwnStorage.
 *
 * Главное свойство — **никогда не терять запись**. Если переложить файл не
 * удалось, функция обязана вернуть исходную ссылку, а не бросить и не отдать
 * пустоту. Ссылка, которая протухнет, лучше отсутствующей.
 *
 * Второе свойство — **не перекладывать своё дважды**: путь вызывается из
 * нескольких мест, и повторное скачивание собственного файла было бы чистой
 * тратой.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploads: Array<{ key: string; bytes: number }> = []
let uploadError: { message: string } | null = null

vi.mock('@/core/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (key: string, buf: Buffer) => {
          if (uploadError) return Promise.resolve({ error: uploadError })
          uploads.push({ key, bytes: buf.length })
          return Promise.resolve({ error: null })
        },
        getPublicUrl: (key: string) => ({
          data: { publicUrl: `https://own.example.com/storage/${key}` },
        }),
      }),
    },
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { mirrorToOwnStorage } = await import('@/core/supabase/mirrorToStorage')

describe('mirrorToOwnStorage', () => {
  beforeEach(() => {
    uploads.length = 0
    uploadError = null
    process.env.SUPABASE_URL = 'https://own.example.com'
  })

  it('перекладывает чужой файл и отдаёт свою ссылку', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(new Uint8Array(1234), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    )

    const out = await mirrorToOwnStorage('https://provider.example/pic.png', '42')

    expect(out).toMatch(/^https:\/\/own\.example\.com\/storage\//)
    expect(uploads).toHaveLength(1)
    expect(uploads[0].bytes).toBe(1234)
    // Владелец попадает в путь — иначе файлы сваливаются в один каталог.
    expect(uploads[0].key).toContain('/42/')
  })

  it('при отказе источника возвращает ИСХОДНУЮ ссылку, а не бросает', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))

    const src = 'https://provider.example/gone.png'
    const out = await mirrorToOwnStorage(src, '42')

    // Терять запись хуже, чем хранить ссылку, которая протухнет.
    expect(out).toBe(src)
    expect(uploads).toHaveLength(0)
  })

  it('при отказе хранилища возвращает исходную ссылку', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(new Uint8Array(10), { status: 200 })
    )
    uploadError = { message: 'Access Denied' }

    const src = 'https://provider.example/pic.png'
    expect(await mirrorToOwnStorage(src, '42')).toBe(src)
  })

  it('не перекладывает то, что уже лежит у нас', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(String(u))
      return new Response(new Uint8Array(1), { status: 200 })
    })

    const own = 'https://own.example.com/storage/v1/object/public/images/a.png'
    expect(await mirrorToOwnStorage(own, '42')).toBe(own)
    // Ни одного сетевого запроса: своё повторно не качаем.
    expect(calls).toEqual([])
  })

  it('пустой ответ источника не считается успехом', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(new Uint8Array(0), { status: 200 })
    )

    const src = 'https://provider.example/empty.png'
    expect(await mirrorToOwnStorage(src, '42')).toBe(src)
    expect(uploads).toHaveLength(0)
  })

  it('не трогает то, что вообще не ссылка', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(String(u))
      return new Response(new Uint8Array(1), { status: 200 })
    })

    expect(await mirrorToOwnStorage('kling_lipsync_17552293', '42')).toBe(
      'kling_lipsync_17552293'
    )
    expect(calls).toEqual([])
  })
})
