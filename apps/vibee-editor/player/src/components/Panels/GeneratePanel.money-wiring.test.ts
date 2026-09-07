import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * ДЕНЕЖНАЯ ОБВЯЗКА ПАНЕЛИ — НА УРОВНЕ ИСХОДНИКА.
 *
 * Помощники в `lib/balance.ts` покрыты обычными тестами, и это НЕ ловит тот
 * дефект, который здесь случался дважды: помощник написан и зелен, а к кнопке
 * не подключён. Так `запомнитьЧек` был определён и не вызывался ни разу; так
 * ворота баланса стояли на трёх кнопках из четырёх, и без проверки осталась
 * ровно самая дорогая — липсинк, до 60 токенов за нажатие.
 *
 * Отрисовать панель в тесте нельзя дёшево: она тянет jotai, редактор, атомы
 * проекта и сеть. Поэтому проверяем то, что и ломалось, — есть ли вызов в
 * коде каждой из четырёх кнопок.
 */
const ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */ = fs
  .readFileSync(path.join(__dirname, 'GeneratePanel.tsx'), 'utf8')
  .replace(/\/\/ cyrillic-ok:[^\n]*/g, '')
  .replace(/\s*\/\* cyrillic-ok:[^*]*\*\/\s*/g, '')

const ОПЕРАЦИИ = [
  'image_generate',
  'video_generate',
  'audio_generate',
  'lipsync_generate',
] as const

describe('у каждой кнопки есть цена, ворота и причина', () => {
  for (const оп of ОПЕРАЦИИ) {
    it(`${оп}: подпись цены`, () => {
      expect(ПАНЕЛЬ).toMatch(new RegExp(`подписьЦены\\(\\s*'${оп}'`))
    })

    it(`${оп}: ворота до нажатия`, () => {
      // Без этого отказ приходит ПОСЛЕ нажатия — то, ради чего ворота и есть.
      expect(ПАНЕЛЬ).toMatch(new RegExp(`неХватает\\(\\s*'${оп}'`))
    })

    it(`${оп}: причина словами, а не серая кнопка`, () => {
      expect(ПАНЕЛЬ).toMatch(new RegExp(`почемуНельзя\\(\\s*\n?\\s*'${оп}'`))
    })
  }
})

describe('чек виден на всех четырёх вкладках и не переживает генерацию', () => {
  for (const вкладка of ['image', 'video', 'audio', 'lipsync']) {
    it(`${вкладка}: чек отрисован`, () => {
      expect(ПАНЕЛЬ).toContain(`{чек && activeTab === '${вкладка}' && (`)
    })
  }

  it('чек стирается на старте каждой генерации', () => {
    /*
     * Строка одна на всю панель, а `запомнитьЧек` молча выходит, когда в
     * ответе нет `charged` — так отвечают и неудача, и мок, и агентский ключ.
     * Без стирания «списано 2 · осталось 98» от картинки повисало над словами
     * «генерация не удалась» на видео: счёт за работу, которой не было.
     */
    expect(ПАНЕЛЬ).toContain('const забытьЧек = () => setЧек(null)')
    // Inspect each dispatch, not a global count: provider changes also clear
    // a receipt now, but must not mask a missing clear in a generation path.
    const handlers =
      ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */
        .match(
          // cyrillic-ok: existing API or fixture identifier
          /const handleGenerate\w+ = async \(\) => \{[\s\S]*?\n {2}\}/g
        ) ?? [] // cyrillic-ok: existing fixture identifier
    expect(handlers).toHaveLength(ОПЕРАЦИИ.length) // cyrillic-ok: existing fixture identifier
    for (const handler of handlers) {
      expect(
        handler.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      ).toContain('забытьЧек()') // cyrillic-ok: existing receipt API assertion
    }
  })
})

describe('длина текста доходит до счёта озвучки', () => {
  it('множитель считается и передаётся в цену, ворота и причину', () => {
    // Маршрут озвучки умножает счёт на начатые тысячи знаков при ЛЮБОЙ
    // модели. Экран множителя не знал: 2500 знаков по 12 — кнопка «· 12»,
    // счёт 36.
    expect(ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */).toContain(
      'const тысячиОзвучки = тысячиЗнаковКОплате(audioText)'
    )
    expect(ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */).toContain(
      "неХватает('audio_generate', audioModel, тысячиОзвучки)"
    )
    expect(ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */).toContain(
      "подписьЦены('audio_generate', audioModel, тысячиОзвучки)"
    )
    expect(
      ПАНЕЛЬ /* cyrillic-ok: existing fixture identifier */
        .match(
          // cyrillic-ok: existing API or fixture identifier
          /'Введите текст, который надо произнести',\s*\n?\s*тысячиОзвучки/g // cyrillic-ok: existing API or fixture identifier
        )?.length
    ).toBe(2)
  })
})
