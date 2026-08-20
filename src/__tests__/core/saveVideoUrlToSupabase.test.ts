/**
 * 🧪 Тесты записи ассетов в Supabase
 *
 * Регрессия, ради которой это написано: сигнатура была позиционной,
 * saveVideoUrlToSupabase(telegramId, videoUrl, videoPath, type), и 11 из 12
 * мест вызова передавали служебный id вторым аргументом, а ссылку — третьим.
 * В проде это подтверждено строкой, где public_url =
 * 'kling_lipsync_1755229300876_144022504', а настоящая ссылка на replicate
 * лежала в storage_path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const insert = vi.fn()

vi.mock('@/core/supabase', () => ({
  supabase: { from: vi.fn(() => ({ insert })) },
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * ЗАЧЕМ ЭТА ЗАГЛУШКА. Без неё тест ходил в сеть по-настоящему:
 * saveVideoUrlToSupabase зовёт mirrorToOwnStorage, а тот СКАЧИВАЕТ файл по
 * адресу из аргумента и кладёт его в наше хранилище.
 *
 * Проверки проходили только потому, что зеркалирование по контракту при любой
 * неудаче возвращает исходную ссылку — а `https://replicate.delivery/xezq/abc/
 * out.mp4` не существует. То есть тест зависел от того, что сеть ОТКАЖЕТ.
 *
 * Отсюда и нестабильность: `npm run test:gate` поймал этот файл как «зелёный
 * со второго раза». Единичный флак обесценивает проверку постепенно —
 * «регрессий нет» перестаёт что-либо значить, если часть красного считается
 * шумом.
 *
 * Зеркалирование проверяется отдельно, в src/__tests__/assets/mirror-storage.test.ts.
 */
vi.mock('@/core/supabase/mirrorToStorage', () => ({
  mirrorToOwnStorage: vi.fn(async (url: string) => url),
}))

import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

const row = () => insert.mock.calls[0][0]

describe('saveVideoUrlToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insert.mockResolvedValue({ error: null })
  })

  it('пишет ссылку в public_url, а не в storage_path', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '144022504',
      publicUrl: 'https://replicate.delivery/xezq/abc/out.mp4',
      type: 'kling_lipsync',
    })

    expect(supabase.from).toHaveBeenCalledWith('assets')
    expect(row().public_url).toBe('https://replicate.delivery/xezq/abc/out.mp4')
  })

  // Регрессия: первая версия писала сюда null, а колонка в базе NOT NULL
  // (проверено пробой на проде, код 23502). Падала бы КАЖДАЯ вставка, и
  // молча — ошибка только логируется, вызывающий код её не видит.
  it('storage_path без значения — пустая строка, не null (колонка NOT NULL)', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://example.com/a.mp4',
      type: 'video',
    })

    expect(row().storage_path).toBe('')
    expect(row().storage_path).not.toBeNull()
  })

  it('trigger_word и type всегда заполнены — тоже NOT NULL', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://example.com/a.mp4',
      type: 'video',
    })

    expect(row().trigger_word).toBe('video')
    expect(row().type).toBe('video')
  })

  it('НЕ пишет строку, если вместо ссылки пришёл служебный id', async () => {
    // ПОПРАВКА К ПРЕЖНЕЙ ВЕРСИИ. Проверялось, что случай попадает в
    // предупреждения. Предупреждений в этом проекте тысячи, они тонут — а
    // случай означает «генерация оплачена, следа нет». Теперь это ошибка с
    // отдельной формулировкой, и функция возвращает false, чтобы вызывающий
    // мог узнать об отказе.
    const ok = await saveVideoUrlToSupabase({
      telegramId: '144022504',
      publicUrl: 'kling_lipsync_1755229300876_144022504',
      type: 'kling_lipsync',
    })

    expect(insert).not.toHaveBeenCalled()
    expect(ok).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })

  it('НЕ пишет строку при пустой ссылке — обновить её потом нечем', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '144022504',
      publicUrl: '',
      type: 'lipsync',
    })

    expect(insert).not.toHaveBeenCalled()
  })

  it('telegram_id всегда строка', async () => {
    await saveVideoUrlToSupabase({
      telegramId: 144022504,
      publicUrl: 'https://example.com/a.mp4',
      type: 'video',
    })

    expect(row().telegram_id).toBe('144022504')
    expect(typeof row().telegram_id).toBe('string')
  })

  it('пишет bot_name — колонка есть, но 80% строк в проде с NULL', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://example.com/a.mp4',
      type: 'video',
      botName: 'neuro_blogger_bot',
    })

    expect(row().bot_name).toBe('neuro_blogger_bot')
  })

  it('пишет промпт в text, а не захардкоженное «Generated video»', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://example.com/a.mp4',
      type: 'video',
      text: 'кот в скафандре',
    })

    expect(row().text).toBe('кот в скафандре')
  })

  it('storage_path сохраняется, когда файл действительно у нас', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://xyz.supabase.co/storage/v1/object/public/videos/a.mp4',
      storagePath: 'videos/a.mp4',
      type: 'ai_reels_inngest',
    })

    expect(row().storage_path).toBe('videos/a.mp4')
  })

  it('ошибка вставки не роняет вызывающий код, но видна ему', async () => {
    // ПОПРАВКА К ПРЕЖНЕЙ ВЕРСИИ. Проверялось, что функция возвращает
    // undefined. Это и было дефектом: вызывающий не мог отличить записанное от
    // незаписанного, и вопрос «получил ли человек видео» оставался без ответа
    // (docs/audit/paid-nothing-made.md). Ронять по-прежнему нельзя — видео уже
    // сгенерировано и отправлено; но отказ обязан быть видимым.
    insert.mockResolvedValue({ error: { message: 'boom' } })

    await expect(
      saveVideoUrlToSupabase({
        telegramId: '1',
        publicUrl: 'https://example.com/a.mp4',
        type: 'video',
      })
    ).resolves.toBe(false)

    expect(logger.error).toHaveBeenCalled()
  })

  it('trigger_word по умолчанию video, но переопределяется', async () => {
    await saveVideoUrlToSupabase({
      telegramId: '1',
      publicUrl: 'https://example.com/a.png',
      type: 'flux',
      triggerWord: 'image',
    })

    expect(row().trigger_word).toBe('image')
  })
})
