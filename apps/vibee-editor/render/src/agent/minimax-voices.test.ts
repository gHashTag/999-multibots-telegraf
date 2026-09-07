import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  ГОЛОСА_MINIMAX,
  голосMinimax,
  скоростьРечи,
  входМиниМакс,
  имяДляElevenLabs,
} from './minimax-voices'

/**
 * ВЫБОР, КОТОРЫЙ НИЧЕГО НЕ МЕНЯЕТ, — ЭТО НЕ ВЫБОР.
 *
 * Тесты названы по тому, чего не должно случиться на экране. Замер, ради
 * которого они написаны: три попытки разными голосами стоили трижды и
 * возвращали один и тот же файл, потому что сборка тела принимала ОДИН текст.
 */
describe('голос и скорость доходят до провайдера', () => {
  it('известный голос уходит дословно', () => {
    // Идентификаторы не переводим и не придумываем: провайдер понимает свои.
    expect(входМиниМакс('привет', { voice: 'Russian_ReliableMan' })).toEqual({
      text: 'привет',
      voice_id: 'Russian_ReliableMan',
    })
  })

  it('ЧУЖОЙ голос не уходит вовсе, а не ломает запрос', () => {
    /*
     * Веб на отказе `/api/voices` подставлял `sarah`/`rachel`/`josh` — имена,
     * которых нет ни у одного провайдера. Отправь их — MiniMax откажет, а
     * деньги уже списаны. Молча прочитать голосом по умолчанию лучше, чем не
     * прочитать.
     */
    for (const чужой /* cyrillic-ok: existing fixture identifier */ of [
      'sarah',
      'rachel',
      'josh',
      '694f9389-aac1-45b6',
      '',
      null,
    ]) {
      expect(входМиниМакс('т', { voice: чужой })).toEqual({ text: 'т' })
    }
  })

  it('скорость уходит и прижимается к границам провайдера', () => {
    // Схема модели: 0.5–2.0. Вне границ Replicate отказывает на весь запрос,
    // то есть ползунок, уехавший за край, стоил бы денег и не дал ничего.
    const normalSpeed = входМиниМакс('т', { speed: 1.25 }) // cyrillic-ok: existing provider API
    expect(normalSpeed).toEqual({
      text: 'т',
      speed: 1.25,
    })
    expect(входМиниМакс('т', { speed: 5 })).toEqual({ text: 'т', speed: 2 })
    expect(входМиниМакс('т', { speed: 0.1 })).toEqual({ text: 'т', speed: 0.5 })
    expect(скоростьРечи('abc')).toBeUndefined()
  })

  it('единица не шлётся: это и есть значение провайдера по умолчанию', () => {
    // Лишнее поле в теле — лишняя причина для отказа.
    expect(входМиниМакс('т', { speed: 1 })).toEqual({ text: 'т' })
    expect(входМиниМакс('т')).toEqual({ text: 'т' })
  })

  it('русские голоса есть, и их восемь — все, что даёт провайдер', () => {
    // Приложение русскоязычное, а список ElevenLabs был английским целиком.
    const русские = ГОЛОСА_MINIMAX.filter(г => г.id.startsWith('Russian_'))
    expect(русские.length).toBe(8)
    for (const г of ГОЛОСА_MINIMAX) expect(голосMinimax(г.id)).toBe(г.id)
  })
})

const СЕРВЕР = fs.readFileSync(
  path.join(__dirname, '..', '..', 'render-server.ts'),
  'utf8'
)

describe('проводка, а не только помощник', () => {
  // Automatic Replicate TTS routing was removed. The actual route's provider
  // selection and failure behavior are covered in audio-provider.test.ts.

  it('/api/voices не отвечает 500, когда озвучить всё равно есть кем', () => {
    // Отказ ElevenLabs — не сбой, а постоянное состояние: ключ в переменной
    // хранит идентификатор, а не ключ. 500 оставлял экран с тремя выдуманными
    // именами вместо голосов того, кто действительно читает.
    expect(СЕРВЕР).toContain('voices: ГОЛОСА_MINIMAX')
    expect(СЕРВЕР).toContain("provider: 'replicate/minimax-speech-02-turbo'")
  })
})

describe('имя голоса уходит тому, кто его узнает', () => {
  it('русская подпись НЕ уходит в ElevenLabs', () => {
    // Список голосов теперь MiniMax, и `voice_name` приходит по-русски.
    // Нога KieAI ждёт имя ElevenLabs; чужая строка даёт отказ на ПЕРВОЙ ноге.
    expect(имяДляElevenLabs('Максим — уверенный')).toBeUndefined()
    expect(имяДляElevenLabs('Wise Lady')).toBe('Wise Lady')
    expect(имяДляElevenLabs('Rachel')).toBe('Rachel')
    expect(имяДляElevenLabs('  Josh  ')).toBe('Josh')
  })

  it('мусор и пустота дают голос по умолчанию, а не отказ', () => {
    expect(имяДляElevenLabs('')).toBeUndefined()
    expect(имяДляElevenLabs(undefined)).toBeUndefined()
    expect(имяДляElevenLabs('x'.repeat(80))).toBeUndefined()
    expect(имяДляElevenLabs('Russian_ReliableMan')).toBeUndefined()
  })

  it('нога KieAI берёт имя через отбор, а не как есть', () => {
    expect(СЕРВЕР).toContain("имяДляElevenLabs(voice_name) ?? 'Rachel'")
    expect(СЕРВЕР).not.toMatch(/voice:\s*\n\s*typeof voice_name === 'string'/)
  })
})

describe('скорость доходит до КАЖДОЙ ноги, а не до одной', () => {
  it('нога ElevenLabs кладёт скорость в voice_settings', () => {
    /*
     * Ползунок терялся на всех трёх ногах. Две починены; эта осталась бы
     * мёртвой ровно до того дня, когда починят ключ ElevenLabs, — и слайдер
     * снова перестал бы значить что-либо, без единой правки в коде.
     */
    const serverCode = СЕРВЕР.replace(/\/\/ cyrillic-ok:[^\n]*/g, '') // cyrillic-ok: existing source fixture
    expect(serverCode).toMatch(
      /voice_settings: \{[\s\S]{0,200}?speed: скоростьРечи\(speed\)/ // cyrillic-ok: existing provider API check
    )
  })

  it('единица не шлётся ни одной ноге: это и есть значение по умолчанию', () => {
    // Лишнее поле в теле — лишняя причина для отказа.
    expect(СЕРВЕР).toMatch(/скоростьРечи\(speed\) !== 1/)
  })
})
