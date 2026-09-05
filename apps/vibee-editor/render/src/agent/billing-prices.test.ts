import { describe, it, expect } from 'vitest'
import { ЕДИНИЦА_ЦЕНЫ } from './kie-prices.generated'
import {
  посекунднаяМодель,
  посекундныеМодели,
  секундыКОплате,
  TOKEN_PRICES,
  priceForKieModel,
  модельныеЦены,
  OPERATION_COST_USD,
  COST_PER_TOKEN_USD,
  НАЦЕНКА,
} from './billing-shared'

/**
 * ЦЕНА, НАЗВАННАЯ КЛИЕНТУ, ОБЯЗАНА СОВПАДАТЬ С СПИСАННОЙ.
 *
 * Тесты названы по тому, чего НЕ должно случиться. Проверены возвратом
 * дефекта: убери `НАЦЕНКА` из `priceFor` — падает «наценка действует на все
 * операции»; отдай клиенту `TOKEN_PRICES` вместо `модельныеЦены()` — падает
 * «названная цена совпадает со списываемой».
 */

/** То же выражение, что в `chargeMiniAppUser`: цена модели, иначе цена вида. */
function спишут(op: string, modelId?: string): number {
  const кие = modelId?.startsWith('kie/')
    ? priceForKieModel(modelId.slice(4))
    : null
  return кие ?? TOKEN_PRICES[op] ?? 0
}

/** То же выражение, что в приложении (`Баланс.цена`). */
function назовут(op: string, modelId?: string): number {
  const цены = модельныеЦены()
  return (modelId ? цены[modelId] : undefined) ?? TOKEN_PRICES[op] ?? 0
}

describe('цены', () => {
  it('наценка действует на ВСЕ операции, а не только на модели', () => {
    for (const [op, cost] of Object.entries(OPERATION_COST_USD)) {
      // `toFixed` здесь по той же причине, что и в самой формуле: без него
      // тест закрепил бы лишний токен как правильный ответ.
      expect(TOKEN_PRICES[op]).toBe(
        Math.ceil(Number(((cost * НАЦЕНКА) / COST_PER_TOKEN_USD).toFixed(6)))
      )
      // Продажа по себестоимости — это не «дёшево», это отсутствие наценки.
      expect(TOKEN_PRICES[op]).toBeGreaterThan(
        Math.ceil(cost / COST_PER_TOKEN_USD) - 1
      )
    }
  })

  it('названная цена совпадает со списываемой у КАЖДОЙ модели', () => {
    const расхождения: string[] = []
    for (const [имя] of Object.entries(модельныеЦены())) {
      for (const op of Object.keys(TOKEN_PRICES)) {
        if (назовут(op, имя) !== спишут(op, имя)) {
          расхождения.push(`${имя} / ${op}: ${назовут(op, имя)} ≠ ${спишут(op, имя)}`)
        }
      }
    }
    expect(расхождения).toEqual([])
  })

  it('модель без своей цены роняет ОБЕ стороны на цену вида', () => {
    // Асимметрия здесь и была бы дефектом: клиент назвал бы одно, сервер взял
    // другое — ровно то, что мы чиним.
    const нет = 'kie/такой-модели-нет'
    expect(модельныеЦены()[нет]).toBeUndefined()
    for (const op of Object.keys(TOKEN_PRICES)) {
      expect(назовут(op, нет)).toBe(спишут(op, нет))
      expect(назовут(op, нет)).toBe(TOKEN_PRICES[op])
    }
  })

  it('точное деление не даёт лишнего токена', () => {
    // 0.035 * 2 / 0.005 == 14, но в двоичной арифметике 14.000000000000002,
    // и наивный ceil брал 15. Замер: лишний токен с четырёх моделей.
    const ц = модельныеЦены()
    expect(ц['kie/seedream/5-pro-text-to-image']).toBe(14)
    expect(ц['kie/seedream/5-pro-image-to-image']).toBe(14)
    expect(ц['kie/ideogram/v3-text-to-image']).toBe(7)
    // Был `elevenlabs/audio-isolation` = 28. Модель осталась без цены: в
    // прайсе KieAI нет строки про выделение голоса вовсе, а стояла ставка
    // «Elevenlabs V3, Text to dialogue» — чужого товара. Взамен закреплены
    // две модели, которые дают ту же точную дробь:
    //   0.04 * 2 / 0.005 = 16.000000000000004 -> наивный ceil дал бы 17
    //   0.06 * 2 / 0.005 = 24.000000000000004 -> и 25
    expect(ц['kie/google/imagen4']).toBe(16)
    expect(ц['kie/elevenlabs/text-to-speech-multilingual-v2']).toBe(24)
  })

  it('модели одного семейства НЕ делят цену самой дешёвой', () => {
    /*
     * Одно имя прайса на несколько наших моделей означало, что цену выбирает
     * правило «бери минимум». Замер: Imagen 4 Fast $0.02, default $0.04,
     * Ultra $0.06 — все три продавались по цене Fast, то есть Ultra втрое
     * ниже себестоимости.
     */
    const ц = модельныеЦены()
    expect(ц['kie/google/imagen4-fast']).toBeLessThan(ц['kie/google/imagen4'])
    expect(ц['kie/google/imagen4']).toBeLessThan(ц['kie/google/imagen4-ultra'])
    expect(ц['kie/elevenlabs/text-to-speech-turbo-2-5']).toBeLessThan(
      ц['kie/elevenlabs/text-to-speech-multilingual-v2']
    )
  })

  it('акционная строка прайса не становится ценой модели', () => {
    // «seedream 5 Pro, input image, First image free» стоит $0.0025 при
    // настоящих $0.035 — правило «бери минимум» выбирало её, и модель
    // продавалась вчетырнадцатеро ниже себестоимости.
    const ц = модельныеЦены()
    expect(ц['kie/seedream/5-pro-text-to-image']).toBeGreaterThan(
      ц['kie/seedream/5-lite-text-to-image']
    )
  })

  it('посекундность не выводится из ВИДА работы', () => {
    // Внутри «видео» единицы разные: 8 моделей «за секунду», 4 «за ролик».
    // Пометка на виде поэтому неверна в принципе, а не «пока неточна».
    expect(посекунднаяМодель('kie/kling/v3-turbo-text-to-video')).toBe(true)
    expect(посекунднаяМодель('kie/grok-imagine/text-to-video')).toBe(true)
    // Картинки посекундными не бывают ни при каких условиях.
    expect(посекунднаяМодель('kie/seedream/5-lite-text-to-image')).toBe(false)
    // Неизвестная модель не должна СЛУЧАЙНО стать посекундной: умножение на
    // длительность там, где цена за ролик, — это счёт в разы больше.
    expect(посекунднаяМодель('kie/такой-модели-нет')).toBe(false)
    expect(посекунднаяМодель(undefined)).toBe(false)
  })

  it('список посекундных моделей назван теми же именами, что шлёт клиент', () => {
    const имена = посекундныеМодели()
    expect(имена.length).toBeGreaterThan(0)
    for (const и of имена) expect(и.startsWith('kie/')).toBe(true)
    // Иначе клиент не найдёт свою модель в списке и промолчит про «/с».
    expect(имена).toContain('kie/infinitalk/from-audio')
  })

  it('кривая длительность даёт секунду, а не ноль и не отказ', () => {
    expect(секундыКОплате('6s')).toBe(6)
    expect(секундыКОплате('10s')).toBe(10)
    expect(секундыКОплате(6)).toBe(6)
    // Ноль списал бы НИЧЕГО за сделанную работу; мусор — «invalid billing
    // quantity» вместо счёта. И то и другое хуже минимума в секунду.
    expect(секундыКОплате('')).toBe(1)
    expect(секундыКОплате(undefined)).toBe(1)
    expect(секундыКОплате('0s')).toBe(1)
    expect(секундыКОплате(-5)).toBe(1)
    // Потолок совпадает с проверкой в chargeMiniAppUser.
    expect(секундыКОплате('99999s')).toBe(3600)
  })

  it('модель, чью единицу не перевести в вызов, НЕ ПРОДАЁТСЯ', () => {
    /*
     * «$0.7 за млн токенов» — не цена одной озвучки. Взятая плоско, она
     * давала 280 токенов за работу в доли цента, и Gemini 3.1 Flash стоял в
     * приложении рядом с ElevenLabs по 12.
     *
     * Тест смотрит на ЕДИНИЦУ, а не на список имён: перегенерация таблицы по
     * старому правилу вернёт цену — и этот тест назовёт виноватую модель.
     */
    const цены = модельныеЦены()
    const проданные = Object.keys(ЕДИНИЦА_ЦЕНЫ)
      .filter(id => ЕДИНИЦА_ЦЕНЫ[id] === 'за млн токенов')
      .filter(id => цены[`kie/${id}`] != null)
    expect(проданные).toEqual([])
  })

  it('ни одна цена не равна нулю: бесплатных генераций нет', () => {
    for (const [имя, ц] of Object.entries(модельныеЦены())) {
      expect(ц, имя).toBeGreaterThanOrEqual(1)
    }
    for (const op of Object.keys(TOKEN_PRICES)) {
      expect(TOKEN_PRICES[op], op).toBeGreaterThanOrEqual(1)
    }
  })
})
