/**
 * Незаписанный результат видео виден, а не молчит.
 *
 * ИЗМЕРЕНО ПО ДАННЫМ. Доля списаний, у которых рядом (±30 минут) есть след
 * работы — запись в `prompts_history` или `assets`:
 *
 *   neuro_photo          97-100% во все 17 месяцев
 *   image_to_video       7-38%, а с января 2026 — 0% при сотне списаний
 *   digital_avatar_body  0-54%
 *   text_to_video        0-36%
 *
 * `neuro_photo` здесь — отрицательный контроль: он доказывает, что способ
 * замера рабочий и что у картинок след пишется исправно. Значит разница не в
 * методе, а в видеопутях.
 *
 * ЧЕГО ЭТИ ЧИСЛА НЕ ГОВОРЯТ. По ним НЕЛЬЗЯ заключить, что люди не получили
 * видео. Можно заключить ровно одно: мы этого не знаем — потому что при
 * неудачной записи функция молчала и возвращала void.
 *
 * Тест стережёт способность узнать.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))

const SAVE = 'src/core/supabase/saveVideoUrlToSupabase.ts'
const HELPER = 'src/modules/videoGenerator/helpers/supabaseHelper.ts'

const save = strip(fs.readFileSync(SAVE, 'utf8'))
const helper = strip(fs.readFileSync(HELPER, 'utf8'))

describe('запись результата видео сообщает об отказе', () => {
  it('разбор находит функцию — иначе тест пустой', () => {
    expect(save).toMatch(/export async function saveVideoUrlToSupabase/)
  })

  it('функция возвращает признак, а не void', () => {
    // void не оставляет вызывающему никакого способа узнать об отказе.
    expect(save).toMatch(/saveVideoUrlToSupabase\([\s\S]{0,80}?\): Promise<boolean>/)
    expect(save).not.toMatch(/saveVideoUrlToSupabase\([\s\S]{0,80}?\): Promise<void>/)
  })

  it('обе ветки отказа возвращают false', () => {
    // Их ровно две: ссылка не похожа на ссылку и вставка не удалась.
    const falses = save.match(/return false/g) || []
    expect(falses.length).toBeGreaterThanOrEqual(2)
  })

  it('успешная ветка возвращает true', () => {
    expect(save).toMatch(/return true/)
  })

  it('отказ записи попадает в журнал как ошибка, а не как предупреждение', () => {
    // Предупреждение в этом проекте тонет: их тысячи. Ошибка с отдельной
    // формулировкой находится поиском.
    expect(save).toMatch(/logger\.error\([\s\S]{0,120}РЕЗУЛЬТАТ НЕ ЗАПИСАН/)
    expect(save).not.toMatch(/logger\.warn\([\s\S]{0,120}Пропущена запись/)
  })

  it('вызывающий проверяет результат, а не выбрасывает его', () => {
    // Иначе признак есть, а толку нет — тот же класс «действие без проверки».
    expect(helper).toMatch(/const saved = await saveVideoUrlToSupabase/)
    expect(helper).toMatch(/if \(!saved\)/)
  })
})
