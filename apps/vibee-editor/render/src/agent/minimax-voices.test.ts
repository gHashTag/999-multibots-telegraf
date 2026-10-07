import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  ГОЛОСА_MINIMAX,
  голосMinimax,
  скоростьРечи,
  входМиниМакс,
  имяДляElevenLabs,
  OWNER_MINIMAX_CLONE,
  isCloneVoiceId,
  spokenBrand,
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
    for (const чужой of [
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
    expect(входМиниМакс('т', { speed: 1.25 })).toEqual({
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
  it('нога Replicate собирает тело через входМиниМакс', () => {
    /*
     * Семнадцатое правило: помощник может быть зелёным и не подключённым.
     * Именно так здесь и было — тело собиралось прямо на месте, из одного
     * `text`.
     */
    expect(СЕРВЕР).toContain('входМиниМакс(text, выбор)')
    expect(СЕРВЕР).not.toContain('JSON.stringify({ input: { text } })')
  })

  it('маршрут озвучки передаёт выбор человека в эту ногу', () => {
    expect(СЕРВЕР).toMatch(
      /generateAudioViaReplicate\(text,\s*\{[\s\S]{0,400}?voice: voice_id,[\s\S]{0,200}?speed,/
    )
  })

  it('/api/voices answers with the voices of the TTS that speaks: Kie', () => {
    // Was ElevenLabs directly, then MiniMax ids on its refusal -- neither of
    // which the Kie leg could speak (src/agent/kie-speech.ts).
    expect(СЕРВЕР).toContain('JSON.stringify(voicesAnswer())')
    expect(СЕРВЕР).not.toContain('voices: ГОЛОСА_MINIMAX')
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

  it('the Kie leg maps the choice through kieVoiceFor, not a fixed name', () => {
    // The old leg sent every voice as 'Rachel' (kie-speech.test.ts).
    expect(СЕРВЕР).not.toContain("имяДляElevenLabs(voice_name) ?? 'Rachel'")
    expect(СЕРВЕР).toMatch(
      /speakOnKie\(\s*text,[\s\S]{0,300}?voiceId: voice_id,/
    )
  })
})

describe('the speed reaches every leg that is left', () => {
  it('the Kie leg passes the slider to speakOnKie (clamped there)', () => {
    expect(СЕРВЕР).toMatch(/speakOnKie\([\s\S]{0,400}?speed,/)
  })
})

/**
 * THE OWNER'S VOICE, FOR THE OWNER ONLY (2026-09-26).
 *
 * The story reel stopped at the voice: ElevenLabs is down across the
 * platform, so the owner's clone there is unreachable. The owner's MiniMax
 * clone on Replicate is honoured -- but only on a call the service itself
 * makes, never on a voice id a person types in.
 */
describe("the owner's MiniMax clone", () => {
  it('reaches the provider on a trusted service call, in the clone field', () => {
    expect(
      входМиниМакс('hello', { clone: OWNER_MINIMAX_CLONE, trustedClone: true }) // cyrillic-ok: existing export
    ).toMatchObject({ voice_id: OWNER_MINIMAX_CLONE })
  })

  it('is dropped when a person names it, so nobody else speaks as the owner', () => {
    const body = входМиниМакс('hello', { voice: OWNER_MINIMAX_CLONE }) // cyrillic-ok: existing export
    expect(body).not.toHaveProperty('voice_id')
    // Untrusted, the clone field is ignored too.
    expect(
      входМиниМакс('hello', { clone: OWNER_MINIMAX_CLONE }) // cyrillic-ok: existing export
    ).not.toHaveProperty('voice_id')
  })

  /*
   * THE HOLE THIS CLOSED (2026-09-26). audio_generate forwards the model's
   * `voice_id` argument to the route with the SERVICE key, so a trusted call
   * is not proof the service chose the voice. With the clone honoured from
   * `voice` on a trusted call, any person's agent could write the owner's id
   * and speak as the owner. Now `voice` is a library voice or nothing.
   */
  it('a clone id in `voice` is dropped even on a trusted call', () => {
    expect(
      входМиниМакс('hello', { voice: OWNER_MINIMAX_CLONE, trustedClone: true }) // cyrillic-ok: existing export
    ).not.toHaveProperty('voice_id')
    expect(
      входМиниМакс('hello', { voice: 'R8_SOMEONEELSE', trustedClone: true }) // cyrillic-ok: existing export
    ).not.toHaveProperty('voice_id')
  })

  it('a clone field that is not an id never reaches the provider', () => {
    for (const clone of ['', 'a b', 'https://x/y', '<script>', 42, null]) {
      expect(
        входМиниМакс('hello', { clone, trustedClone: true }) // cyrillic-ok: existing export
      ).not.toHaveProperty('voice_id')
    }
    expect(isCloneVoiceId('R8_5GW2UI4A')).toBe(true)
    expect(isCloneVoiceId('lead-voice_900000077')).toBe(true)
  })

  it('the route marks only its api-key callers as trusted', () => {
    expect(СЕРВЕР).toMatch(
      /trustedClone: authenticate\(req\)\.via === 'api-key'/
    ) // cyrillic-ok: existing name
  })

  it('audio_generate gives the owner clone to the house only, in the clone field', () => {
    const tools = fs.readFileSync(path.join(__dirname, 'tools.ts'), 'utf8')
    expect(tools).toMatch(
      /HOUSE_TELEGRAM_IDS\.includes\(ctx\.telegramId\)\s*\)\s*\{\s*cloneVoice = OWNER_MINIMAX_CLONE/
    )
    // The model's own voice_id never carries a clone to the route.
    expect(tools).toMatch(/clone_voice: cloneVoice/)
  })

  /*
   * "Why doesn't the reel the bot sends me use my voice?" (owner,
   * 2026-10-03). The MiniMax clone lives on Replicate, which is off, so the
   * route refused every owner line. With Replicate off, the owner's line goes
   * to our own voice-clone service instead -- BEFORE the route is asked.
   */
  it("with Replicate off, the owner's line goes to our voice-clone service before the route", () => {
    const tools = fs.readFileSync(path.join(__dirname, 'tools.ts'), 'utf8')
    const ours = tools.search(
      /if \(cloneVoice === OWNER_MINIMAX_CLONE && !replicateLive\(\)\) \{\s*const ours = await ownerVoiceViaOurClone\(/
    )
    const route = tools.indexOf('`${base}/api/generate/audio`')
    expect(ours).toBeGreaterThan(-1)
    expect(route).toBeGreaterThan(ours)
    // It speaks the brand as one word, like the route does.
    expect(tools.slice(ours, ours + 300)).toMatch(
      /ownerVoiceViaOurClone\(\s*spokenBrand\(String\(args\.text\)\)/
    )
    // Our service is free: whatever the line, the charge goes back.
    const branch = tools.slice(
      ours,
      tools.indexOf('if (!voiceId && !cloneVoice)', ours)
    )
    expect(branch.match(/refundTokens\(/g)?.length).toBe(2)
    // Exactly what was taken, both times (refundTokens' `exact`).
    expect(branch.match(/charge\['потрачено'\]\s*\)/g)?.length).toBe(2) // cyrillic-ok: existing field
    // And the answer names no spend: the receipt is for 0, not the table price.
    expect(branch).toMatch(/withTokens\([\s\S]*?\},\s*0\s*\)/)
    expect(tools).toMatch(/TOOLS\.find\(t => t\.name === 'voice_clone_speak'\)/)
    // story_reel voices its scenes at once; the CPU service takes one line
    // at a time, so the lines queue instead of meeting 503; a line that
    // still meets "busy" backs off until one overall deadline.
    expect(tools).toMatch(/const turn = ourCloneQueue\.then\(/)
    expect(tools).toMatch(/ourCloneQueue = turn\.catch\(/)
    expect(tools).toMatch(/speakWithBusyRetry\([\s\S]*?OUR_CLONE_BUSY_RETRY/)
    // Locked to the owner and keepers BEFORE the line joins the queue.
    const helper = tools.slice(
      tools.indexOf('async function ownerVoiceViaOurClone('),
      tools.indexOf('const turn = ourCloneQueue.then(')
    )
    expect(helper).toMatch(
      /if \(!isOwnerOrKeeper\(String\(ctx\?\.telegramId \?\? ''\)\)\)\s*return \{ done: false, reason: VOICE_CLONE_LOCKED_REASON \}/
    )
  })
})

/*
 * "The bot is always read as TRINITY, otherwise it reads the numbers
 * crookedly" (the owner, 2026-09-26). The spoken name is one word.
 */
describe('the bot is spoken as Trinity', () => {
  it('turns the written brand into one spoken word', () => {
    expect(spokenBrand('Я запустил Trinity S³AI DNA.')).toBe(
      'Я запустил Тринити.' // cyrillic-ok: the spoken line
    )
    expect(spokenBrand('Я запустил Trinity S3AI.')).toBe('Я запустил Тринити.') // cyrillic-ok: the spoken line
    expect(spokenBrand('Я запустил Тринити эс-три эй-ай ди-эн-эй.')).toBe(
      'Я запустил Тринити.' // cyrillic-ok: the spoken line
    )
    expect(spokenBrand('Открой S³AI.')).toBe('Открой Тринити.') // cyrillic-ok: the spoken line
  })

  it('keeps an English line English', () => {
    expect(spokenBrand('I launched Trinity S3AI DNA.')).toBe(
      'I launched Trinity.'
    )
  })

  it('leaves a line without the brand as it was', () => {
    const line = 'Открой бота — подарок уже ждёт.' // cyrillic-ok: the spoken line
    expect(spokenBrand(line)).toBe(line)
  })

  it('audio_generate speaks the line through it', () => {
    const tools = fs.readFileSync(path.join(__dirname, 'tools.ts'), 'utf8')
    expect(tools).toMatch(/text: spokenBrand\(String\(args\.text\)\)/)
  })
})
