import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KIE_MODELS, NEVER_PROBE } from './src/agent/kie-models'
import { СЕБЕСТОИМОСТЬ_USD } from './src/agent/kie-prices.generated'
import { ИМЯ_В_ПРАЙСЕ } from './src/agent/kie-price-names'

/**
 * Два списка, которые надо помнить пополнять, расходятся всегда.
 *
 * Каталог KieAI живёт в двух местах: серверный реестр (добытый замером) и
 * `KieModels.swift`, который приложение показывает человеку. Swift-файл
 * СГЕНЕРИРОВАН из реестра, но генерация — разовое событие, а расхождение —
 * процесс: реестр обновят, файл забудут.
 *
 * Этот репозиторий уже платил за ровно такую пару: маршрут забыли внести в
 * публичный список, и он молча отвечал 401 при полностью верном коде. Тогда
 * вывод был записан как правило — сверять списки должен код, а не память. Вот
 * его применение.
 */

const swift = fs.readFileSync(
  path.join(__dirname, '../../vibee-ios/Vibee/KieModels.swift'),
  'utf8'
)

/** Идентификаторы из Swift-каталога — ровно то, что увидит человек. */
function изSwift(): string[] {
  return [...swift.matchAll(/Модель\(id: "([^"]+)"/g)].map(m => m[1])
}

describe('каталог в приложении не разошёлся с реестром', () => {
  it('в Swift ровно те же модели, что на сервере', () => {
    // Сравниваем МНОЖЕСТВА, а не длины: одинаковое число при разном составе
    // — самое коварное расхождение, оно проходит счётную проверку.
    expect(изSwift().sort()).toEqual(KIE_MODELS.map(m => m.id).sort())
  })

  it('живость каждой модели совпадает', () => {
    // Показать приостановленную как доступную — обещание, которого продукт не
    // сдержит; показать живую как выключенную — отнять работающую функцию.
    for (const m of KIE_MODELS) {
      // Строка читается ДО КОНЦА СТРОКИ, а не до первой скобки: названия
      // содержат скобки («озвучка (многоязычная)»), и шаблон [^)]* обрывался
      // на них, теряя поле «живая». Тест краснел из-за собственного разбора,
      // а не из-за расхождения — самый обидный вид ложной тревоги.
      const строка = swift
        .split('\n')
        .find(l => l.includes(`Модель(id: "${m.id}"`))
      expect(строка, `${m.id} отсутствует в Swift`).toBeTruthy()
      expect(строка, `${m.id}: живость разошлась`).toContain(
        `живая: ${m.state === 'live'}`
      )
    }
  })

  it('модель, берущая деньги за пустой запрос, помечена и в приложении', () => {
    // Пометка нужна не экрану, а следующему автору: она единственная причина,
    // по которой будущий автопробник обойдёт её стороной.
    //
    // THE FENCE IS WIDER THAN THE CATALOGUE, BY DESIGN (2026-09-16). This
    // check used to demand that EVERY id in NEVER_PROBE appear in the Swift
    // catalogue -- so fencing a model required shipping it first. But the
    // list is named, in its own comment, as a defence against "a sweep of a
    // NEW catalogue", and the only case where that matters is a model we do
    // not have yet. `sunburst` is exactly that: never run, never offered,
    // fenced in advance.
    //
    // So the invariant is: a dangerous model the app SHOWS must be marked.
    // One fenced and not shown is not a divergence.
    const inRegistry = new Set(KIE_MODELS.map(m => m.id))
    let checked = 0
    for (const опасная of NEVER_PROBE) {
      if (!inRegistry.has(опасная)) continue // cyrillic-ok: existing loop name
      const строка = swift
        .split('\n')
        .find(l => l.includes(`Модель(id: "${опасная}"`))
      expect(
        строка,
        `${опасная} есть в реестре, но пропала из Swift`
      ).toBeTruthy()
      expect(строка, `${опасная}: не помечена опасной`).toContain(
        'опасная: true'
      )
      checked += 1
    }
    // Otherwise a check that compared nothing would read as green.
    expect(
      checked,
      'no dangerous model was there to compare at all'
    ).toBeGreaterThan(0)
  })

  it('приостановленные показаны, а не вырезаны', () => {
    // Скрыть их — соврать умолчанием: человек решит, что Sora у нас нет вовсе.
    const пауза = KIE_MODELS.filter(m => m.state === 'paused')
    expect(пауза.length).toBeGreaterThan(0)
    for (const m of пауза) expect(изSwift()).toContain(m.id)
  })

  it('файл помечен как сгенерированный', () => {
    // Иначе кто-то поправит его руками, и правка исчезнет при следующей
    // генерации — молча, что хуже конфликта.
    expect(swift).toMatch(/СГЕНЕРИРОВАН/)
    expect(swift).toContain('kie-models.ts')
  })
})

describe('цены не разошлись с сопоставлением', () => {
  it('каждая модель реестра имеет запись в списке имён прайса', () => {
    // Забыть новую модель здесь — значит показать её без цены, а человек
    // прочтёт пустоту как «бесплатно». Генератор на это падает; тест
    // сообщает раньше и понятнее.
    const нет = KIE_MODELS.filter(m => !(m.id in ИМЯ_В_ПРАЙСЕ)).map(m => m.id)
    expect(нет, `нет в kie-price-names.ts: ${нет.join(', ')}`).toEqual([])
  })

  it('в списке имён нет моделей, которых больше нет в реестре', () => {
    const лишние = Object.keys(ИМЯ_В_ПРАЙСЕ).filter(
      k => !KIE_MODELS.some(m => m.id === k)
    )
    expect(лишние, `лишние: ${лишние.join(', ')}`).toEqual([])
  })

  it('без цены в Swift ровно те, у кого её нет в прайсе', () => {
    // Обе стороны проверяются НАВСТРЕЧУ друг другу: «nil там, где null» и
    // «null там, где nil». Односторонняя проверка пропустила бы цену,
    // проставленную модели, которой её никто не называл.
    const безЦеныSwift = new Set(
      [...swift.matchAll(/Модель\(id: "([^"]+)"[^\n]*ценаUSD: nil/g)].map(
        m => m[1]
      )
    )
    /*
     * ПРИЧИН «НЕТ ЦЕНЫ» ДВЕ, И ОБЕ ЗАКОННЫ.
     *
     * 1. Имени нет в прайсе вовсе — `ИМЯ_В_ПРАЙСЕ === null`. Так у
     *    `elevenlabs/audio-isolation`: строки про выделение голоса в прайсе
     *    KieAI нет ни одной.
     * 2. Цена названа в единице, которую не перевести в один вызов, и
     *    генератор пишет `null` в себестоимость. Так у моделей «за млн
     *    токенов»: 280 токенов за озвучку в доли цента — не цена.
     *
     * Проверка знала только первую причину и падала на второй. Это не повод
     * её ослабить: смысл прежний — в Swift `nil` РОВНО там, где цены за вызов
     * нет, — просто оснований теперь два.
     */
    const безЦеныСписок = new Set([
      ...Object.entries(ИМЯ_В_ПРАЙСЕ)
        .filter(([, v]) => v === null)
        .map(([k]) => k),
      ...Object.entries(СЕБЕСТОИМОСТЬ_USD)
        .filter(([, v]) => v === null)
        .map(([k]) => k),
    ])
    expect([...безЦеныSwift].sort()).toEqual([...безЦеныСписок].sort())
  })

  it('цена и единица всегда идут парой', () => {
    // «$0.09» без единицы — не цена, а число: за секунду и за ролик
    // различаются в разы. Пара обязана быть целой с обеих сторон.
    for (const l of swift.split('\n').filter(l => l.includes('Модель(id:'))) {
      const ценаNil = /ценаUSD: nil/.test(l)
      const единицаNil = /единица: nil/.test(l)
      expect(ценаNil, `${l.slice(0, 60)}: цена и единица разошлись`).toBe(
        единицаNil
      )
    }
  })
})
