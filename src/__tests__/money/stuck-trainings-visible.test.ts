/**
 * Человек узнаёт о застрявшем обучении, а не только «моделей нет».
 *
 * ЧЕЙ ЭТО ОПЫТ. @Ludmila (7007992081) заплатила за обучение пять раз —
 * 1210 звёзд, июль 2025. Две записи висят в `running` тринадцать месяцев, ни
 * одной готовой модели. Она единственная такая из 69 плативших за обучение
 * (пересчитано в этой итерации; вчерашние «пятеро новых» оказались артефактом
 * окна ±6 часов — docs/audit/five-without-training.md).
 *
 * Что она видела в боте: «У вас нет обученных моделей» — список фильтруется по
 * `status = SUCCESS`. Ни слова о том, что обучение шло и застряло. Человек
 * заплатил, ждёт, а бот отвечает так, будто он ничего не начинал.
 *
 * Сторож `checkStuckTrainings` в проекте есть, но не зарегистрирован, и его
 * подключение меняет статусы в базе — это решение владельца. Здесь ничего не
 * меняется: только читается и сообщается.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

let rows: unknown[] = []
let queryError: { message: string } | null = null

function chain() {
  const link: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order']) link[m] = vi.fn(() => link)
  link.limit = vi.fn(() => Promise.resolve({ data: queryError ? null : rows, error: queryError }))
  return link
}

vi.mock('@/core/supabase', () => ({ supabase: { from: () => chain() } }))

import {
  getStuckTrainings,
  stuckTrainingsMessage,
  STUCK_AFTER_HOURS,
} from '@/core/supabase/getStuckTrainings'

/** Фиксированное «сейчас»: тест не должен зависеть от календаря. */
const NOW = Date.parse('2026-08-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString()

beforeEach(() => {
  rows = []
  queryError = null
})

describe('застрявшее обучение видно человеку', () => {
  it('свежее обучение застрявшим не считается', () => {
    // Обучение идёт 1-2 часа. Назвать час «застряло» значит пугать зря.
    expect(STUCK_AFTER_HOURS).toBeGreaterThanOrEqual(3)
  })

  it('долгое обучение попадает в список', async () => {
    rows = [{ created_at: hoursAgo(400), model_name: 'user7007992081', status: 'running' }]
    const stuck = await getStuckTrainings('7007992081', NOW)
    expect(stuck).toHaveLength(1)
    expect(stuck[0].hoursStuck).toBe(400)
  })

  it('недавнее обучение в список НЕ попадает', async () => {
    rows = [{ created_at: hoursAgo(1), model_name: 'свежее', status: 'running' }]
    expect(await getStuckTrainings('1', NOW)).toEqual([])
  })

  it('при отказе базы возвращается пусто, а не падение', async () => {
    // Сцена, из которой это зовут, показывает меню. Уронить её из-за
    // справочного сообщения — хуже, чем не показать сообщение.
    queryError = { message: 'база недоступна' }
    expect(await getStuckTrainings('1', NOW)).toEqual([])
  })

  it('в тексте названы срок и то, что деньги вернут', async () => {
    const msg = stuckTrainingsMessage(
      [{ created_at: hoursAgo(400), model_name: 'user7007992081', hoursStuck: 400 }],
      true
    )
    expect(msg).toMatch(/16 дн/)
    expect(msg).toMatch(/поддержку/)
    expect(msg).toMatch(/вернут/)
  })

  it('сцены действительно показывают это сообщение', () => {
    // Функция, которую никто не зовёт, — не починка. Проверяем оба визарда.
    for (const f of [
      'src/scenes/neuroPhotoWizard/index.ts',
      'src/scenes/neuroPhotoWizardV2/index.ts',
    ]) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, f).toMatch(/getStuckTrainings/)
      expect(src, f).toMatch(/stuckTrainingsMessage\(stuck, isRu\)/)
    }
  })
})
