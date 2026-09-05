import { describe, it, expect } from 'vitest'
import {
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
    expect(ц['kie/elevenlabs/audio-isolation']).toBe(28)
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

  it('ни одна цена не равна нулю: бесплатных генераций нет', () => {
    for (const [имя, ц] of Object.entries(модельныеЦены())) {
      expect(ц, имя).toBeGreaterThanOrEqual(1)
    }
    for (const op of Object.keys(TOKEN_PRICES)) {
      expect(TOKEN_PRICES[op], op).toBeGreaterThanOrEqual(1)
    }
  })
})
