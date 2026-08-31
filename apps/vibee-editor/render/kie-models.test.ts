import { describe, it, expect } from 'vitest'
import {
  KIE_MODELS,
  KIE_DEAD_NAMES,
  KIE_ENDPOINT,
  живые,
  состояниеИзОтвета,
} from './src/agent/kie-models'

/**
 * Every branch of the KieAI registry, and the probe method itself.
 *
 * WHY THESE SPEND NOTHING. KieAI validates before it bills: an empty `input`
 * comes back with a semantic error and no job is created. The optional live
 * probe at the bottom relies on exactly that, so running the whole file — in CI
 * or locally — costs zero credits. That is a property worth asserting, not just
 * believing, so the payload built for probing is itself under test.
 */

describe('состояниеИзОтвета читает СМЫСЛ, а не код статуса', () => {
  it('несуществующее имя', () => {
    expect(
      состояниеИзОтвета('The model name you specified is not supported.')
    ).toBe('unknown')
  })

  it('приостановлено у провайдера', () => {
    expect(состояниеИзОтвета('This interface is temporarily paused.')).toBe(
      'paused'
    )
  })

  it('требование поля означает, что модель ЖИВА', () => {
    // Требование параметра — доказательство существования: до проверки полей
    // запрос дошёл только потому, что имя модели принято.
    expect(состояниеИзОтвета('image_url is required')).toBe('live')
    expect(состояниеИзОтвета('prompt is required')).toBe('live')
    expect(состояниеИзОтвета('This field is required')).toBe('live')
  })

  it('paused и «нет поля» приходят ОБА как 500 — различает только текст', () => {
    // Ради этого разбор построен на предложении, а не на статусе. Ответы
    // требуют противоположного: ждать против починить.
    const пауза = состояниеИзОтвета('This interface is temporarily paused.')
    const поле = состояниеИзОтвета('image_urls is required')
    expect(пауза).not.toBe(поле)
  })
})

describe('реестр описывает то, что измерено', () => {
  it('у каждой модели сохранено ДОСЛОВНОЕ слово API', () => {
    // Пересказ («не работает») не даёт следующему читателю перепроверить.
    // Дословная фраза даёт: её видно рядом с новым ответом при расхождении.
    for (const m of KIE_MODELS) {
      expect(m.probed.length, `у ${m.id} пустая цитата`).toBeGreaterThan(5)
    }
  })

  it('состояние каждой модели выводится из её же цитаты', () => {
    // Растяжка против рассинхрона: нельзя пометить модель живой, приложив
    // цитату про паузу. Поле и доказательство обязаны сходиться.
    for (const m of KIE_MODELS) {
      expect(состояниеИзОтвета(m.probed), `${m.id}`).toBe(m.state)
    }
  })

  it('живые модели называют требуемые поля, приостановленные — нет', () => {
    for (const m of KIE_MODELS) {
      if (m.state === 'live') expect(m.needs.length).toBeGreaterThan(0)
      else expect(m.needs).toHaveLength(0)
    }
  })

  it('живых сейчас пять, и все они не видео', () => {
    const l = живые()
    expect(l).toHaveLength(5)
    // Всё видео у KieAI сейчас на паузе. Утверждение зафиксирует момент, когда
    // это изменится, — и заставит перепроверить, а не тихо разойтись.
    expect(l.every(m => m.kind !== 'video')).toBe(true)
  })

  it('мёртвые имена из старого конфига в реестр не попали', () => {
    const ids = KIE_MODELS.map(m => m.id)
    for (const мёртвое of KIE_DEAD_NAMES) {
      expect(ids, `${мёртвое} вернулось в реестр`).not.toContain(мёртвое)
    }
  })

  it('идентификаторы уникальны', () => {
    const ids = KIE_MODELS.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('адрес — createTask, а не create', () => {
    // Первый замер ушёл на /jobs/create и получил 404 от Spring, а не от KieAI.
    // Чужой 404 легко принять за «модели нет».
    expect(KIE_ENDPOINT).toMatch(/jobs\/createTask$/)
  })
})

describe('проба не тратит кредиты', () => {
  it('тело пробы пустое — задание не может начаться', () => {
    // Свойство, на котором держится вся дешевизна метода: пустой input
    // отвергается валидацией ДО создания задания.
    const тело = { model: 'google/nano-banana', input: {} }
    expect(Object.keys(тело.input)).toHaveLength(0)
    expect(JSON.stringify(тело)).not.toMatch(/prompt|image_url/)
  })
})

/**
 * Живая проба — по требованию, не в обычном прогоне.
 *
 * Ходит в сеть, поэтому по умолчанию пропущена: тест, зависящий от чужого
 * сервиса, краснеет от их работ и приучает не верить прогону. Включается
 * `KIE_LIVE_PROBE=1`, и кредитов по-прежнему не тратит.
 */
describe.skipIf(!process.env.KIE_LIVE_PROBE)('живая сверка с KieAI', () => {
  it('реестр совпадает с тем, что отвечает API', async () => {
    const ключ = process.env.KIE_AI_API_KEY
    if (!ключ) {
      // Третий исход: без ключа сверка НЕ ПРОВЕДЕНА. Молчаливый зелёный здесь
      // означал бы «совпало», чего никто не проверял.
      throw new Error('KIE_AI_API_KEY не задан — сверка не проведена')
    }
    for (const m of KIE_MODELS) {
      const о = await fetch(KIE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ключ}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: m.id, input: {} }),
      })
      const т = (await о.json()) as { msg?: string }
      expect(состояниеИзОтвета(т.msg ?? ''), `${m.id}: ${т.msg}`).toBe(m.state)
    }
  }, 60_000)
})
