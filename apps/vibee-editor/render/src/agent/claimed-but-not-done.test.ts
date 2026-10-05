import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HONESTY_NOTE,
  MEDIA_HONESTY_NOTE,
  MEDIA_TOOLS,
  VOICE_HONESTY_NOTE,
  VOICE_TOOLS,
  browserCalls,
  claimsBrowserWork,
  honestyLogFields,
  honestyNote,
  unbackedClaims,
  unbackedKinds,
} from './claimed-but-not-done'

const call = (name: string) => ({ тип: 'инструмент', имя: name }) // cyrillic-ok: the event envelope
const text = (t: string) => ({ тип: 'текст', текст: t }) // cyrillic-ok: the event envelope

/*
 * Media claims (#3658). The browser claims are pinned in
 * render/described-but-not-done.test.ts; this file adds the picture,
 * video and send claims and how the two kinds combine.
 */
describe('a claimed picture or video needs the call that makes it', () => {
  it('flags "made the poster" with no picture call (05.10 owner chat)', () => {
    const said = 'Сделал для тебя афишу в стиле нуар!' // cyrillic-ok: test input
    expect(honestyNote(said, [text(said)])).toBe(MEDIA_HONESTY_NOTE)
    expect(unbackedKinds(said, [])).toEqual(['media'])
    expect(claimsBrowserWork(said)).toBe(false)
  })

  it('lets a poster through when image_edit or image_generate ran', () => {
    const said = 'Вот твоя афиша.' // cyrillic-ok: test input
    expect(honestyNote(said, [call('image_edit')])).toBe('')
    expect(honestyNote(said, [call('image_generate')])).toBe('')
  })

  it('backs a sent video by any send or video tool', () => {
    const said = 'Отправил вам видео.' // cyrillic-ok: test input
    expect(honestyNote(said, [])).toBe(MEDIA_HONESTY_NOTE)
    expect(honestyNote(said, [call('tg_send_video')])).toBe('')
    expect(honestyNote(said, [call('lipsync_generate')])).toBe('')
  })

  it('flags a made reel with only a picture call', () => {
    const said = 'Смонтировал ролик для вас.' // cyrillic-ok: test input
    expect(honestyNote(said, [call('image_edit')])).toBe(MEDIA_HONESTY_NOTE)
    expect(honestyNote(said, [call('story_reel')])).toBe('')
  })

  it('reads English claims too', () => {
    expect(honestyNote("I've made the poster.", [])).toBe(MEDIA_HONESTY_NOTE)
    expect(honestyNote('Here is your image.', [])).toBe(MEDIA_HONESTY_NOTE)
    expect(honestyNote('I opened the page.', [])).toBe(HONESTY_NOTE)
  })

  it('does not treat an offer, a question or a plan as a claim', () => {
    for (const said of [
      'Сделаю афишу?', // cyrillic-ok: test input
      'Хочешь, нарисую картинку с твоим фото.', // cyrillic-ok: test input
      'Могу сделать постер — пришли дату и место.', // cyrillic-ok: test input
      'I will make the poster after you confirm.',
    ]) {
      expect(honestyNote(said, [])).toBe('')
    }
  })

  it('does not flag a send that points back at an earlier turn', () => {
    const said = 'Я отправил тебе афишу выше.' // cyrillic-ok: test input
    expect(honestyNote(said, [])).toBe('')
  })

  it('keeps the browser check even when the answer points back', () => {
    const said = 'Открываю страницу, как и раньше.' // cyrillic-ok: test input
    expect(honestyNote(said, [])).toBe(HONESTY_NOTE)
  })

  it('appends both notes, browser first, when both kinds are unbacked', () => {
    const said = 'Сделал афишу и открываю сайт.' // cyrillic-ok: test input
    expect(honestyNote(said, [])).toBe(HONESTY_NOTE + MEDIA_HONESTY_NOTE)
  })

  it('logs the kinds, the unbacked tools and the real calls, no words', () => {
    const said = 'Сделал афишу и открываю сайт.' // cyrillic-ok: test input
    const events = [call('browser_status'), call('crm_find'), text(said)]
    const fields = honestyLogFields(said, events)
    expect(fields).toEqual({
      claim: 'browser+media',
      unbacked: ['browser_open', 'image_generate'],
      browserCalls: 1,
      toolCalls: 2,
    })
    expect(JSON.stringify(fields)).not.toContain('афиш') // cyrillic-ok: test input
  })

  it('counts only browser tools as browser calls', () => {
    expect(
      browserCalls([call('browser_open'), call('image_edit'), text('x')])
    ).toBe(1)
  })

  it('ignores events with no tool name', () => {
    expect(browserCalls([{ тип: 'инструмент' }])).toBe(0) // cyrillic-ok: the event envelope
  })

  it('backs a picture by every tool that makes one (PR #3667 review)', () => {
    const said = 'Подготовил картинку для вас.' // cyrillic-ok: test input
    for (const t of [
      'image_edit',
      'image_generate',
      'crm_deliver_photo',
      'agent_avatars_make',
      'crm_portrait_rescue',
    ]) {
      expect(honestyNote(said, [call(t)])).toBe('')
    }
  })

  it('backs a reel by every tool that makes one (PR #3667 review)', () => {
    const said = 'Собрал для вас ролик.' // cyrillic-ok: test input
    for (const t of ['crm_story_reel', 'my_story_reel', 'story_reel']) {
      expect(honestyNote(said, [call(t)])).toBe('')
    }
  })

  it('does not flag an honest "I did not make it"', () => {
    for (const said of [
      'Я не сделал афишу: нет фото.', // cyrillic-ok: test input
      'Пока не отправил видео — жду ответа.', // cyrillic-ok: test input
      'Я не  сделал афишу.', // cyrillic-ok: test input, two spaces
    ]) {
      expect(honestyNote(said, [])).toBe('')
    }
  })

  it('does not flag what the person made or said (PR #3667 re-review)', () => {
    for (const said of [
      'Ты сделал афишу сам?', // cyrillic-ok: test input
      'Классно, ты сделал афишу!', // cyrillic-ok: test input
      'Вы написали: «я сделал афишу». Покажете?', // cyrillic-ok: test input
      'You wrote "I made the poster" -- can you send it?',
    ]) {
      expect(honestyNote(said, [])).toBe('')
    }
  })

  it('still flags "мне" + claim, and "раньше" does not switch the check off', () => {
    for (const said of [
      'Готово, сделал афишу, как ты просил мне.', // cyrillic-ok: test input
      'Сделал афишу лучше, чем раньше.', // cyrillic-ok: test input
    ]) {
      expect(unbackedKinds(said, [])).toEqual(['media'])
    }
  })
  it('an inch mark does not hide a claim (#3677)', () => {
    expect(
      unbackedKinds('Экран 27". Сделал афишу и отправил "файл".', []) // cyrillic-ok: test input
    ).toEqual(['media'])
    // a real straight-quoted claim is still someone else's words
    expect(honestyNote('Он написал "сделал афишу" и пропал.', [])).toBe('') // cyrillic-ok: test input
  })

  it('a back-reference excuses its own sentence only (#3677)', () => {
    expect(unbackedKinds('Отправил афишу выше.', [])).toEqual([]) // cyrillic-ok: test input
    expect(
      unbackedKinds('Ранее обсуждали дату. Сделал афишу.', []) // cyrillic-ok: test input
    ).toEqual(['media'])
  })

  it('two inch marks do not pair into a quote around a claim (#3680 review)', () => {
    expect(
      unbackedKinds('Монитор 27", сделал афишу, ширина 30" — готово.', []) // cyrillic-ok: test input
    ).toEqual(['media'])
  })

  // Clean on main, flagged by the first split of #3680 (bee, round 1).
  for (const text of [
    '- Сделал афишу (см. выше)', // cyrillic-ok: test input
    'Ранее я сделал афишу, т.е. постер, и отправил файл.', // cyrillic-ok: test input
    'Earlier, i.e. yesterday, I made the poster.',
    'В прошлом сообщении я:\n- сделал афишу\n- отправил её тебе', // cyrillic-ok: test input
    'Выше я:\n1. Сделал афишу\n2. Отправил файл', // cyrillic-ok: test input
  ])
    it(`abbreviations and a referring header excuse: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual([])
    })

  it('an abbreviation before a capital does not end the sentence', () => {
    // "that is" abbreviated, before a name: without the list it splits off the back-reference
    expect(
      unbackedKinds('Ранее, т.е. Пётр просил, я сделал афишу.', []) // cyrillic-ok: test input
    ).toEqual([])
  })

  it('an unlisted abbreviation before a small letter does not end it either', () => {
    // the "year" abbreviation is not in the list; the small letter after it keeps the sentence whole
    expect(
      unbackedKinds('Ранее, ещё в 2025 г. я сделал тебе афишу.', []) // cyrillic-ok: test input
    ).toEqual([])
  })

  // A line break inside a sentence does not end it.
  for (const text of ['Я сделал\nафишу для тебя.', 'Вот твоя\nафиша.']) // cyrillic-ok: test input
    it(`a wrapped claim is still a claim: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual(['media'])
    })

  it('a header excuses only its own list; the next paragraph is checked', () => {
    expect(
      unbackedKinds('Выше я:\n- сделал афишу\n\nСделал афишу.', []) // cyrillic-ok: test input
    ).toEqual(['media'])
    expect(
      unbackedKinds('Сделал афишу выше. Отправил файл.', []) // cyrillic-ok: test input
    ).toEqual(['media'])
  })
})

describe('a referring header in any style, and nothing past its list (#3680 round 4)', () => {
  // Clean on main, flagged by the colon-only header test of round 3.
  for (const text of [
    '**Выше я:**\n- сделал афишу\n- отправил файл', // cyrillic-ok: test input
    '### Что я сделал ранее\n- Сделал афишу\n- Отправил файл', // cyrillic-ok: test input
    'Выше я\n- сделал афишу\n- отправил файл', // cyrillic-ok: test input
    'Ранее я —\n- сделал афишу', // cyrillic-ok: test input
    'Выше я...\n- сделал афишу', // cyrillic-ok: test input
    'Выше я:\n- сделал афишу\n  и отправил файл', // cyrillic-ok: test input
  ])
    it(`excuses its list: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual([])
    })

  // The header's excuse used to leak onto these new claims.
  for (const text of [
    'Выше я:\n- сделал афишу\nА сейчас отправил файл.', // cyrillic-ok: test input
    'Выше я:\n- сделал афишу. Сейчас отправил файл.', // cyrillic-ok: test input
    'Выше я:\n✅ сделал афишу\nСейчас отправил файл.', // cyrillic-ok: test input
  ])
    it(`still flags the new claim: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual(['media'])
    })

  it('a sentence that only mentions the past is not a header', () => {
    expect(
      unbackedKinds('Ранее мы обсуждали афишу.\n- Сделал афишу', []) // cyrillic-ok: test input
    ).toEqual(['media'])
  })
})

describe('a header across a blank line, an emoji header, bold marks (#3680 round 5)', () => {
  // Clean on main: a heading, a blank line, then its list.
  for (const text of [
    '### Что я сделал ранее\n\n- Сделал афишу\n- Отправил файл', // cyrillic-ok: test input
    '**Выше я:**\n\n- сделал афишу', // cyrillic-ok: test input
    'Earlier I:\n\n- I made the poster',
    '📌 Выше я:\n- сделал афишу', // cyrillic-ok: test input
    '✅ Выше я:\n- сделал афишу\n- отправил файл', // cyrillic-ok: test input
    '📌 Выше я:\n\n- сделал афишу', // cyrillic-ok: test input
  ])
    it(`excuses its list: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual([])
    })

  for (const text of [
    // a bold full sentence is a sentence, not a header: marks are style
    '**Ранее я сделал афишу.**\n- Отправил файл', // cyrillic-ok: test input
    '__Ранее я сделал афишу.__\n- Отправил файл', // cyrillic-ok: test input
    // an emoji header covers its list only, not a plain line after it
    '📌 Выше я:\n- сделал афишу\nСейчас отправил файл.', // cyrillic-ok: test input
  ])
    it(`still flags the claim: ${JSON.stringify(text)}`, () => {
      expect(unbackedKinds(text, [])).toEqual(['media'])
    })
})

describe('a claimed voice message needs the call that makes it (#3684)', () => {
  for (const said of [
    'Записал тебе голосовое, послушай.', // cyrillic-ok: test input
    'Отправила вам голосовое сообщение.', // cyrillic-ok: test input
    'Скинул аудио с ответом.', // cyrillic-ok: test input
    'Озвучил текст поста.', // cyrillic-ok: test input
    'Голосовое сообщение готово!', // cyrillic-ok: test input
    'Вот твоё голосовое.', // cyrillic-ok: test input
    "I've recorded a voice note for you.",
    'I sent you a voice message.',
    'I voiced it in your clone.',
    'Your voice note is ready.',
  ])
    it(`flags an unbacked voice claim: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual(['voice'])
      expect(honestyNote(said, [])).toBe(VOICE_HONESTY_NOTE)
    })

  for (const tool of ['audio_generate', 'voice_clone_speak', 'tg_send_voice'])
    it(`${tool} backs the voice claim`, () => {
      expect(
        honestyNote('Записал тебе голосовое.', [call(tool)]) // cyrillic-ok: test input
      ).toBe('')
    })

  it('a picture call does not back a voice claim', () => {
    expect(
      unbackedKinds('Записал тебе голосовое.', [call('image_generate')]) // cyrillic-ok: test input
    ).toEqual(['voice'])
  })

  // The person's voice, a request, a mode, a negation: no claim of ours.
  for (const said of [
    'Голосовой режим включается кнопкой с микрофоном.', // cyrillic-ok: test input
    'Ответь голосом?', // cyrillic-ok: test input
    'В голосовом ты сказал, что нужна афиша.', // cyrillic-ok: test input
    'Ты записал голосовое — я его послушал.', // cyrillic-ok: test input
    'Я не записал голосовое: нет клона.', // cyrillic-ok: test input
    'Запишу тебе голосовое, когда будет клон.', // cyrillic-ok: test input
    'Озвучил вопрос про цену.', // cyrillic-ok: test input
    'You sent me a voice note.',
    'Shall I record a voice message?',
  ])
    it(`no voice claim: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  // Quotes and back-references are excused as for pictures.
  for (const said of [
    'Ты просил: «запиши голосовое». Записал голосовое выше.', // cyrillic-ok: test input
    'Вы написали: «я записал голосовое».', // cyrillic-ok: test input
    'Выше я:\n- записал голосовое\n- сделал афишу', // cyrillic-ok: test input
  ])
    it(`excuses a quoted or earlier voice: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  it('names both kinds in the log, media first', () => {
    const said = 'Сделал афишу и записал голосовое.' // cyrillic-ok: test input
    expect(unbackedKinds(said, [])).toEqual(['media', 'voice'])
    expect(honestyLogFields(said, []).claim).toBe('media+voice')
    expect(honestyNote(said, [])).toBe(MEDIA_HONESTY_NOTE + VOICE_HONESTY_NOTE)
  })
})

describe('the rare false note and the unpinned rules of #3689', () => {
  // Clean on main, flagged by #3680: a header right under a list item.
  for (const said of [
    '- Готово\nВыше я:\n\n- сделал афишу', // cyrillic-ok: test input
    'Привет! Вот итоги:\n- текст поста\nВыше я:\n\n- сделал афишу', // cyrillic-ok: test input
  ])
    it(`a header under a list item heads its list: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  it('a straight pair closing before a letter is not a quote', () => {
    // an inch mark opens, a quote glued to a suffix "closes": no pair
    const said = 'Формат 50 "x70. Сделал афишу и скинул "PNG"шкой.' // cyrillic-ok: test input
    expect(unbackedKinds(said, [])).toEqual(['media'])
  })

  it('an emoji after a full stop starts a new sentence', () => {
    // the header excuses the first sentence of the item, not the second
    const said = 'Выше я:\n- выложил пост. 🎨 сделал афишу' // cyrillic-ok: test input
    expect(unbackedKinds(said, [])).toEqual(['media'])
  })
})

/*
 * The next media tool must not reopen the false note. Every registered tool
 * whose name says it makes or sends media backs the media claims, or is
 * named here with the reason it does not.
 */
const NOT_A_MEDIA_RESULT: Record<string, string> = {
  crm_client_avatars: 'reads avatars, makes none',
  crm_history: 'reads history',
  tg_history: 'reads history',
  crm_voice_clone: 'trains a voice, sends nothing',
  reel_analyze: 'reads a reel, makes none',
  mail_send: 'e-mail, not a chat picture',
  tokens_invoice: 'an invoice',
}

describe('whose verb, a plan, a question (#3693 review)', () => {
  for (const said of [
    'Анна записала голосовое: просит перенести встречу на пятницу.', // cyrillic-ok: test input
    'Клиент прислал голосовое на 2 минуты, вот расшифровка.', // cyrillic-ok: test input
    'Мария отправила голосовое в 14:02.', // cyrillic-ok: test input
    'Иван скинул войс с адресом.', // cyrillic-ok: test input
    'Он озвучил текст для ролика вчера.', // cyrillic-ok: test input
    'Шаги:\n1. Записал голосовое\n2. Отправил клиенту', // cyrillic-ok: test input
    'Я отправил аудиофайл? Нет, пока только текст.', // cyrillic-ok: test input
    'Твоё голосовое готово к расшифровке? Пришли его сюда.', // cyrillic-ok: test input
    'Мария отправила фото чека.', // cyrillic-ok: test input
  ]) {
    it(`someone else's verb, a plan or a question is no claim: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
  for (const [said, note] of [
    ['Записала голосовое, держи.', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['Озвучила текст, отправляю.', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['Я уже записала тебе голосовое.', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['Анна, я записала голосовое.', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['Готово, отправила фото.', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Записала голосовое, отправить?', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ["Here's the audio.", VOICE_HONESTY_NOTE],
    ['Here is your voice note.', VOICE_HONESTY_NOTE],
    ['Done, voice message sent.', VOICE_HONESTY_NOTE],
  ] as const) {
    it(`the agent's own claim is still flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe(note)
    })
  }
  it('a plan header excuses only its own list', () => {
    const said = 'План:\n- Записал голосовое\n\nЗаписала голосовое.' // cyrillic-ok: test input
    expect(honestyNote(said, [])).toBe(VOICE_HONESTY_NOTE)
  })
})

describe('own clause, any subject, every match (#3693 round 2)', () => {
  for (const [said, note] of [
    ['Сделала афишу — как тебе?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала афишу – как тебе?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Нарисовала постер (нравится?)', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала афишу\nКак тебе?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала афишу 🔥 как тебе?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала афишу нравится?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала тебе видео — глянешь?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Отправила тебе фото — получил?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['I made the poster — like it?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Here is your poster — like it?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Записала голосовое — послушаешь?', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['Короче сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Ну сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['В общем сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Теперь сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Наконец сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Наконец-то сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Специально для тебя сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['По твоей просьбе сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Быстро сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Снова сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Заново сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Анна прислала фото, а я отправила тебе афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    [
      'Анна прислала голосовое, а я записала голосовое в ответ',
      VOICE_HONESTY_NOTE,
    ], // cyrillic-ok: test input
    ['Готово! Сделала афишу, держи', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Вот, нарисовала постер', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Отлично, записала голосовое', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['✅ Записала голосовое', VOICE_HONESTY_NOTE], // cyrillic-ok: test input
    ['🎨 Нарисовала постер для тебя!', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Итак, я сделала афишу', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Сделала афишу, нравится?', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
    ['Мария, отправила тебе фото.', MEDIA_HONESTY_NOTE], // cyrillic-ok: test input
  ] as const) {
    it(`the agent's own claim is flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe(note)
    })
  }
  for (const said of [
    'Записал голосовое?', // cyrillic-ok: test input
    'Я отправил аудиофайл? Нет, пока только текст.', // cyrillic-ok: test input
    'Анна записала голосовое', // cyrillic-ok: test input
    'Мария отправила фото чека', // cyrillic-ok: test input
    'Вчера Анна записала голосовое.', // cyrillic-ok: test input
    'Короче, Анна прислала фото.', // cyrillic-ok: test input
    'Клиентка прислала голосовое.', // cyrillic-ok: test input
    'Кто-то скинул видео в чат.', // cyrillic-ok: test input
    'Вчера клиент прислал голосовое.', // cyrillic-ok: test input
    'Потом он озвучил текст для ролика.', // cyrillic-ok: test input
  ]) {
    it(`a question or someone else's verb is no claim: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

describe("a capitalised opener with no comma is the agent's (#3693 round 3)", () => {
  for (const said of [
    'Ага сделала афишу', // cyrillic-ok: test input
    'Ой сделала афишу', // cyrillic-ok: test input
    'Ура сделала афишу', // cyrillic-ok: test input
    'Вуаля сделала афишу', // cyrillic-ok: test input
    'Пожалуйста сделала афишу', // cyrillic-ok: test input
    'Держи сделала афишу', // cyrillic-ok: test input
    'Лови сделала афишу', // cyrillic-ok: test input
    'Смотри сделала афишу', // cyrillic-ok: test input
    'Подожди сделала афишу', // cyrillic-ok: test input
    'Минутку сделала афишу', // cyrillic-ok: test input
    'Почти сделала афишу', // cyrillic-ok: test input
    'Еле сделала афишу', // cyrillic-ok: test input
    'Мигом сделала афишу', // cyrillic-ok: test input
    'Только-только сделала афишу', // cyrillic-ok: test input
    'Оперативно сделала афишу', // cyrillic-ok: test input
    'Аккуратно сделала афишу', // cyrillic-ok: test input
    'Красиво сделала афишу', // cyrillic-ok: test input
    'Заодно сделала афишу', // cyrillic-ok: test input
    'Параллельно сделала афишу', // cyrillic-ok: test input
    'Дополнительно сделала афишу', // cyrillic-ok: test input
    'Trinity сделала афишу', // cyrillic-ok: test input
    'Мигом записала голосовое', // cyrillic-ok: test input
  ]) {
    it(`flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).not.toBe('')
    })
  }
  for (const said of [
    '@anna прислала голосовое.', // cyrillic-ok: test input
    '@Anna прислала фото.', // cyrillic-ok: test input
    'Ольга прислала видео', // cyrillic-ok: test input
    'Менеджер отправил фото', // cyrillic-ok: test input
    'Сегодня Анна прислала фото чека', // cyrillic-ok: test input
    'Агентство прислало видео', // cyrillic-ok: test input
  ]) {
    it(`someone else's verb stays quiet: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

describe('the media backing list covers the tool registry', () => {
  it('names every media-looking tool, either backing or excused', () => {
    const dir = __dirname
    const names = new Set<string>()
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/name: '([a-z0-9_]+)'/g)) names.add(m[1])
    }
    const media = [...names].filter(n =>
      /image|video|reel|lipsync|photo|portrait|avatar|story|send|picture|poster|audio|voice/.test(
        n
      )
    )
    expect(media.length).toBeGreaterThan(10)
    const loose = media.filter(
      n =>
        !MEDIA_TOOLS.includes(n) &&
        !VOICE_TOOLS.includes(n) &&
        !(n in NOT_A_MEDIA_RESULT)
    )
    expect(loose).toEqual([])
  })
})
