import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  запустить,
  чегоНеХватает,
  модельПоId,
  состояниеЗадания,
} from './src/agent/kie-run'
import { KIE_MODELS } from './src/agent/kie-models'

const getTaskState = состояниеЗадания // cyrillic-ok
const stubFetch = ловушка // cyrillic-ok

/**
 * Every branch, and none of them spends a credit.
 *
 * The whole file runs with `fetch` stubbed. That is not merely convenient: a
 * test suite that submitted real jobs would bill the owner on every CI run, and
 * the guards under test exist precisely to keep requests off the wire. Testing
 * them with real requests would contradict what they are for.
 *
 * The refusal cases below are stronger than they look — each asserts that fetch
 * was NEVER CALLED. Checking only the message would pass even if the request
 * went out and the money was spent.
 */

// Берём живую С ТРЕБОВАНИЯМИ: после расширения реестра до 44 моделей первая
// живая может не иметь полей вовсе, и половина утверждений стала бы пустой.
const живая = KIE_MODELS.find(m => m.state === 'live' && m.needs.length > 0)!
const пауза = KIE_MODELS.find(m => m.state === 'paused')!

afterEach(() => vi.unstubAllGlobals())

function ловушка(ответ: unknown = {}) {
  const f = vi.fn().mockResolvedValue({ json: async () => ответ })
  vi.stubGlobal('fetch', f)
  return f
}

describe('чегоНеХватает сверяет с контрактом самой модели', () => {
  it('приостановленная — отказ до сети', () => {
    const r = чегоНеХватает(пауза, {})
    expect(r).toMatch(/приостановлена/)
    expect(r).toMatch(/кредиты не потрачены/)
  })

  it('называет ИМЕННО недостающие поля, а не все подряд', () => {
    const m = KIE_MODELS.find(x => x.needs.length > 0)!
    expect(чегоНеХватает(m, {})).toContain(m.needs[0])
  })

  it('пустая строка и пустой массив считаются отсутствием', () => {
    const m = KIE_MODELS.find(x => x.needs.includes('prompt'))!
    expect(чегоНеХватает(m, { prompt: '' })).toMatch(/Не хватает/)
    // Пустой массив — на любой модели с полем: конкретное имя поля зависит
    // от того, что потребовал API, и привязка к нему делает тест хрупким.
    const поле = живая.needs[0]
    expect(чегоНеХватает(живая, { [поле]: [] })).toMatch(/Не хватает/)
  })

  it('полный запрос к живой модели пропускается', () => {
    const input = Object.fromEntries(живая.needs.map(п => [п, 'значение']))
    expect(чегоНеХватает(живая, input)).toBeNull()
  })
})

describe('отказы НЕ уходят в сеть', () => {
  it('приостановленная модель: fetch не вызван ни разу', async () => {
    const f = ловушка()
    const r = await запустить(пауза.id, {}, 'ключ')
    expect(r.чейОтказ).toBe('наш')
    // Сильное утверждение: не «сообщение верное», а «денег не потрачено».
    expect(f).not.toHaveBeenCalled()
  })

  it('неполный запрос: fetch не вызван', async () => {
    const f = ловушка()
    const r = await запустить(живая.id, {}, 'ключ')
    expect(r.отказ).toMatch(/Не хватает/)
    expect(f).not.toHaveBeenCalled()
  })

  it('модель вне реестра: fetch не вызван', async () => {
    const f = ловушка()
    const r = await запустить('чего-то-нет', { prompt: 'x' }, 'ключ')
    expect(r.чейОтказ).toBe('наш')
    expect(f).not.toHaveBeenCalled()
  })

  it('нет ключа: fetch не вызван', async () => {
    const f = ловушка()
    // Пустая строка, а не undefined: undefined включает значение по
    // умолчанию, читающее окружение, и «нет ключа» превратилось бы в «ключ
    // из среды». Разницу поймал именно этот тест.
    const r = await запустить(живая.id, { prompt: 'x' }, '')
    expect(r.отказ).toMatch(/KIE_AI_API_KEY/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('запуск полного запроса', () => {
  it('возвращает taskId и шлёт РОВНО то, что просили', async () => {
    const f = ловушка({ data: { taskId: 'T-1' } })
    const input = Object.fromEntries(живая.needs.map(п => [п, 'значение']))
    const r = await запустить(живая.id, input, 'ключ')
    expect(r.taskId).toBe('T-1')
    const тело = JSON.parse((f.mock.calls[0][1] as { body: string }).body)
    expect(тело.model).toBe(живая.id)
    expect(тело.input).toEqual(input)
  })

  it('отказ KieAI передаётся ДОСЛОВНО и помечен как чужой', async () => {
    // Пересказ стёр бы единственное, что различает паузу, нехватку поля и
    // неизвестное имя: все три приходят под одним кодом.
    ловушка({ code: 500, msg: 'This interface is temporarily paused.' })
    const input = Object.fromEntries(живая.needs.map(п => [п, 'з']))
    const r = await запустить(живая.id, input, 'ключ')
    expect(r.отказ).toBe('This interface is temporarily paused.')
    expect(r.чейОтказ).toBe('kie')
  })

  it('ответ без сообщения не выдаётся за успех', async () => {
    ловушка({ code: 500 })
    const input = Object.fromEntries(живая.needs.map(п => [п, 'з']))
    const r = await запустить(живая.id, input, 'ключ')
    expect(r.taskId).toBeUndefined()
    expect(r.отказ).toBeTruthy()
  })
})

describe('опрос состояния', () => {
  it('готово с ссылкой', async () => {
    ловушка({ data: { state: 'success', resultUrls: ['https://x/y.mp4'] } })
    expect(await состояниеЗадания('T', 'ключ')).toEqual({
      готово: true, // cyrillic-ok
      url: 'https://x/y.mp4',
    })
  })

  it('разбирает официальный resultJson unified status API', async () => {
    stubFetch({
      data: {
        state: 'success',
        resultJson: JSON.stringify({
          resultUrls: ['https://x/from-result-json.mp3'],
        }),
      },
    })
    expect(await getTaskState('T', 'ключ')).toEqual({
      готово: true, // cyrillic-ok
      url: 'https://x/from-result-json.mp3',
    })
  })

  it('провал называет причину', async () => {
    ловушка({ msg: 'bad input', data: { state: 'fail' } })
    const r = await состояниеЗадания('T', 'ключ')
    expect(r.готово).toBe(false)
    expect(r.отказ).toBe('bad input')
  })

  it('берёт provider failMsg, когда верхнего сообщения нет', async () => {
    stubFetch({ data: { state: 'fail', failMsg: 'provider rejected input' } })
    const r = await getTaskState('T', 'ключ')
    expect(r['отказ']).toBe('provider rejected input')
  })

  it('recognizes the legacy failed terminal state too', async () => {
    stubFetch({ data: { state: 'failed', failMsg: 'legacy failure' } })
    const r = await getTaskState('T', 'ключ')
    expect(r['отказ']).toBe('legacy failure')
  })

  it('ещё считается — это НЕ провал', async () => {
    // Третий исход: «не готово» и «не вышло» — разные вещи, и путать их
    // значит объявлять неудачу на середине работы.
    ловушка({ data: { state: 'running' } })
    const r = await состояниеЗадания('T', 'ключ')
    expect(r.готово).toBe(false)
    expect(r.отказ).toBeUndefined()
  })

  it('без ключа сверка не проведена, а не провалена', async () => {
    const f = ловушка()
    const r = await состояниеЗадания('T', '')
    expect(r.отказ).toMatch(/KIE_AI_API_KEY/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('модельПоId', () => {
  it('находит каждую из реестра', () => {
    for (const m of KIE_MODELS) expect(модельПоId(m.id)?.id).toBe(m.id)
  })
  it('на чужое имя отвечает undefined', () => {
    expect(модельПоId('нет-такой')).toBeUndefined()
  })
})
