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

describe('a name is the subject only at its clause start, not after a preposition (#3693 round 4)', () => {
  // Flagged on main, quiet at round 3: a capital that is oblique, the
  // addressee, or the agent itself. "Бруно прислал" is the documented price // cyrillic-ok: quoted input
  // of the "-o" adverb rule and keeps its note.
  for (const said of [
    'Тебе отправила видео.', // cyrillic-ok: test input
    'Тебе сделала афишу.', // cyrillic-ok: test input
    'Вам сделала афишу.', // cyrillic-ok: test input
    'Для Вас сделала афишу.', // cyrillic-ok: test input
    'Для Анны сделала афишу.', // cyrillic-ok: test input
    'Специально для Ольги нарисовала постер.', // cyrillic-ok: test input
    'По просьбе Марии сделала афишу.', // cyrillic-ok: test input
    'Для Instagram сделала видео.', // cyrillic-ok: test input
    'В Instagram отправила видео.', // cyrillic-ok: test input
    'В Telegram отправила видео.', // cyrillic-ok: test input
    'Для Reels сделала видео', // cyrillic-ok: test input
    'Под Reels сделала видео.', // cyrillic-ok: test input
    'В Canva сделала афишу.', // cyrillic-ok: test input
    'На Kie сделала видео.', // cyrillic-ok: test input
    'Через Kie сгенерировала картинку.', // cyrillic-ok: test input
    'В стиле Нуар сделала афишу', // cyrillic-ok: test input
    'Для канала Vibee сделала афишу', // cyrillic-ok: test input
    'Агент отправил видео.', // cyrillic-ok: test input
    'Бот отправил видео.', // cyrillic-ok: test input
    'Нейросеть сделала афишу.', // cyrillic-ok: test input
    'Тебе записала голосовое.', // cyrillic-ok: test input
    'Вам записала голосовое.', // cyrillic-ok: test input
    'Блин сделала афишу', // cyrillic-ok: test input
    'Эх сделала афишу', // cyrillic-ok: test input
    'Хоп сделала афишу', // cyrillic-ok: test input
    'Бац сделала афишу', // cyrillic-ok: test input
    'Ладушки сделала афишу', // cyrillic-ok: test input
    'Бруно прислал видео.', // cyrillic-ok: test input
  ]) {
    it(`flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).not.toBe('')
    })
  }
  for (const said of [
    'Анна записала голосовое', // cyrillic-ok: test input
    'Мария отправила фото чека', // cyrillic-ok: test input
    'Ольга прислала видео', // cyrillic-ok: test input
    'Клиент прислал фото', // cyrillic-ok: test input
    'Иван сделал афишу.', // cyrillic-ok: test input
    'Клиентка Мария прислала фото.', // cyrillic-ok: test input
    'Елена Петровна отправила видео.', // cyrillic-ok: test input
    'Сегодня Анна записала голосовое.', // cyrillic-ok: test input
  ]) {
    it(`someone else's verb stays quiet: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

describe('a preposition anywhere earlier in the clause, not only two words back (#3693 round 5)', () => {
  for (const said of [
    'По заказу клиентки Анны нарисовала постер.', // cyrillic-ok: test input
    'В новом стиле Нуар сделала афишу.', // cyrillic-ok: test input
    'Специально для твоего канала Vibee сделала видео.', // cyrillic-ok: test input
    'По твоей просьбе Kie сгенерировала картинку.', // cyrillic-ok: test input
    'По просьбе твоей подруги Марии сделала афишу.', // cyrillic-ok: test input
    'Для твоего нового клиента Анны сделала афишу.', // cyrillic-ok: test input
    'Для нашего общего друга Ивана нарисовала постер.', // cyrillic-ok: test input
  ]) {
    it(`flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).not.toBe('')
    })
  }
  for (const said of [
    'По словам Анны, клиент прислал фото.', // cyrillic-ok: test input
    'Вчера Ольга прислала видео.', // cyrillic-ok: test input
  ]) {
    it(`a comma ends the clause, someone else's verb stays quiet: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

describe("a capital is someone else only in a person's shape (#3723)", () => {
  // Quiet on main: an opener the adverb list lacked. A rare name the name
  // list lacks ("Милослава") gets a needless note -- the safe side. // cyrillic-ok: quoted input
  for (const said of [
    'Утром сделала афишу', // cyrillic-ok: test input
    'Вечером отправила видео', // cyrillic-ok: test input
    'Ночью сделала афишу', // cyrillic-ok: test input
    'Днём сделала афишу', // cyrillic-ok: test input
    'Сперва сделала афишу', // cyrillic-ok: test input
    'Вновь сделала афишу', // cyrillic-ok: test input
    'Даже сделала афишу!', // cyrillic-ok: test input
    'Вдобавок сделала афишу', // cyrillic-ok: test input
    'Плюс сделала афишу', // cyrillic-ok: test input
    'Пока сделала афишу', // cyrillic-ok: test input
    'Вообще сделала афишу', // cyrillic-ok: test input
    'Типа сделала афишу', // cyrillic-ok: test input
    'Значит сделала афишу', // cyrillic-ok: test input
    'Вроде сделала афишу', // cyrillic-ok: test input
    'Кажется сделала афишу', // cyrillic-ok: test input
    'Похоже сделала афишу', // cyrillic-ok: test input
    'Наверное сделала афишу', // cyrillic-ok: test input
    'Разумеется сделала афишу', // cyrillic-ok: test input
    'Впрочем сделала афишу', // cyrillic-ok: test input
    'Хм сделала афишу', // cyrillic-ok: test input
    'Эээ сделала афишу', // cyrillic-ok: test input
    'Готово. Утром сделала афишу', // cyrillic-ok: test input
    'Канва сделала афишу', // cyrillic-ok: test input
    'Милослава прислала фото', // cyrillic-ok: test input
  ]) {
    it(`flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).not.toBe('')
    })
  }
  for (const said of [
    'Саша прислал фото', // cyrillic-ok: test input
    'Наташа прислала фото', // cyrillic-ok: test input
    'Ксюша записала голосовое', // cyrillic-ok: test input
    'Артём прислал фото', // cyrillic-ok: test input
    'Ксюша Петрова прислала фото', // cyrillic-ok: test input
    'Клиент Милослава прислала фото', // cyrillic-ok: test input
    'Anna прислала фото', // cyrillic-ok: test input
    'John отправил видео', // cyrillic-ok: test input
    'Kate сделала афишу', // cyrillic-ok: test input
    'Курьер привёз фото', // cyrillic-ok: test input
    'Дизайнер сделал афишу', // cyrillic-ok: test input
    'Фотограф прислал фото', // cyrillic-ok: test input
    'Подруга Милослава прислала видео', // cyrillic-ok: test input
    'Сегодня клиентка Милослава прислала фото', // cyrillic-ok: test input
    'Вчера подруга Зарина прислала видео', // cyrillic-ok: test input
  ]) {
    it(`someone else's verb stays quiet: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

describe('a surname follows a known first name, not any capital (#3728 review)', () => {
  for (const said of [
    'Ура Готово сделала афишу', // cyrillic-ok: test input
    'Ну Вот отправила видео.', // cyrillic-ok: test input
    'Итак Наконец сделала афишу', // cyrillic-ok: test input
    'Ок Теперь записала голосовое', // cyrillic-ok: test input
    'Да Сразу отправила видео.', // cyrillic-ok: test input
    'Ага Уже сделала афишу', // cyrillic-ok: test input
    'Сегодня Утром сделала афишу', // cyrillic-ok: test input
  ]) {
    it(`two openers are no name, flagged: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).not.toBe('')
    })
  }
  for (const said of [
    'Пётр прислал видео.', // cyrillic-ok: test input
    'Петр прислал видео.', // cyrillic-ok: test input
    'Анна Петрова прислала фото.', // cyrillic-ok: test input
    'Артём Иванов отправил видео.', // cyrillic-ok: test input
  ]) {
    it(`a name, with or without yo and a surname, stays quiet: ${JSON.stringify(said)}`, () => {
      expect(honestyNote(said, [])).toBe('')
    })
  }
})

/*
 * The greeting-then-claim grid (#3728 round 3). Rounds 1-6 of #3693 and
 * rounds 1-2 of #3728 each patched one line a reviewer found, and the next
 * reviewer found its neighbour. This walks every combination of greeting,
 * addressee, separator, opener and verb, and derives the expected answer from
 * one rule: the claim is someone else's only when a person-shaped subject
 * stands right before the verb in the verb's own clause, with no greeting
 * that would make the name the addressee.
 */
describe('greeting, addressee, separator, opener, verb: one rule (#3728 round 3)', () => {
  const GREETINGS = ['', 'Привет ', 'Привет, '] // cyrillic-ok: test input
  const ADDRESSEES = ['', 'Анна', 'Анна Петрова'] // cyrillic-ok: test input
  const SEPARATORS = [' ', ', ', '\n', ' 🙌 ', '! ', '. ', ' — ']
  const OPENERS = ['', 'Готово', 'Вот', 'Ура', 'Сегодня'] // cyrillic-ok: test input
  const VERBS = ['сделала', 'отправила', 'Сделала'] // cyrillic-ok: test input
  const rows = new Map<string, boolean>()
  for (const g of GREETINGS)
    for (const a of ADDRESSEES)
      for (const sep of SEPARATORS)
        for (const o of OPENERS)
          for (const v of VERBS) {
            const lead = a ? g + a + sep : g
            const said = (lead + (o ? o + ' ' : '') + v + ' афишу').trim() // cyrillic-ok: test input
            // quiet only: a name, nothing between it and a lowercase verb
            const quiet =
              a !== '' &&
              g === '' &&
              sep === ' ' &&
              o === '' &&
              v === v.toLowerCase()
            rows.set(said, !quiet)
          }
  it('covers the whole grid', () => {
    expect(rows.size).toBeGreaterThan(400)
  })
  it('every row follows the rule', () => {
    const wrong = [...rows].filter(
      ([said, flagged]) => unbackedKinds(said, []).length > 0 !== flagged
    )
    expect(wrong).toEqual([])
  })
  // representative rows, named so a failure reads at a glance
  for (const said of [
    'Анна\nГотово сделала афишу', // cyrillic-ok: test input
    'Анна 🙌 Готово сделала афишу', // cyrillic-ok: test input
    'Привет Анна 🙂 Готово сделала афишу', // cyrillic-ok: test input
    'Анна Вот сделала афишу', // cyrillic-ok: test input
    'Анна Ура сделала афишу', // cyrillic-ok: test input
    'Привет, Анна 👋\nСделала афишу', // cyrillic-ok: test input
    'Анна 👋 Сделала афишу', // cyrillic-ok: test input
    'Привет Анна Сделала афишу', // cyrillic-ok: test input
    'Привет, Анна сделала афишу', // cyrillic-ok: test input
    'Анна Снова сделала афишу', // cyrillic-ok: test input
    'Анна Только сделала афишу', // cyrillic-ok: test input
  ]) {
    it(`the agent's own claim after a name: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual(['media'])
    })
  }
  for (const said of [
    'Анна сделала афишу', // cyrillic-ok: test input
    'Анна Петрова сделала афишу', // cyrillic-ok: test input
    'Иван Шевченко прислал фото', // cyrillic-ok: test input
    'Anna Smith прислала фото', // cyrillic-ok: test input
    'Менеджер Зорро отправил видео', // cyrillic-ok: test input
  ]) {
    it(`someone else's: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })
  }
})

/*
 * A wrapped claim is still a claim, in every family (#3728 round 4). Round 3
 * joined wrapped lines with a line break and folded it for media and voice
 * only, so a browser claim that wrapped went quiet. This walks every claim
 * example of every family and puts a line break at EVERY space, one at a
 * time: the family must stay flagged wherever the spaced line is flagged.
 */
describe('a line break at any space keeps every family flagged (#3728 round 4)', () => {
  const EXAMPLES: Record<string, string[]> = {
    browser: [
      'Открываю страницу входа в кабинет.', // cyrillic-ok: test input
      'Сделал скриншот экрана для проверки.', // cyrillic-ok: test input
      'Читаю текст страницы целиком.', // cyrillic-ok: test input
      'Нажимаю кнопку входа через Google.', // cyrillic-ok: test input
      'Прокручиваю ленту вниз до конца.', // cyrillic-ok: test input
      'Сейчас проверяю все вкладки, минутку.', // cyrillic-ok: test input
      'Зашла в кабинет, и на экране сейчас вижу форму оплаты.', // cyrillic-ok: test input
      "I'm opening the login page now.",
      'Done, I am opening the page now.',
      'Хорошо, I clicked the button.', // cyrillic-ok: test input
      'I took a screenshot of it.',
    ],
    media: [
      'Сделала для вас афишу в стиле нуар.', // cyrillic-ok: test input
      'Вот ваша афиша к открытию кафе.', // cyrillic-ok: test input
      'Смонтировала тебе видео про кафе.', // cyrillic-ok: test input
      'Отправила вам фото с примеркой.', // cyrillic-ok: test input
      'I made the poster for you.',
      'Here is your poster for the event.',
    ],
    voice: [
      'Записала тебе голосовое сообщение с ответом.', // cyrillic-ok: test input
      'Озвучила для вас текст поста.', // cyrillic-ok: test input
      'Вот ваше голосовое к посту.', // cyrillic-ok: test input
      'Голосовое сообщение готово, слушайте.', // cyrillic-ok: test input
      'I recorded you a voice note.',
      'I have voiced it for you.',
      'Here is your voice note for today.',
      'The voice message is ready now.',
    ],
  }
  const rows: Array<[string, string, string]> = []
  for (const [kind, lines] of Object.entries(EXAMPLES))
    for (const spaced of lines)
      for (let i = spaced.indexOf(' '); i >= 0; i = spaced.indexOf(' ', i + 1))
        rows.push([
          kind,
          spaced,
          spaced.slice(0, i) + '\n' + spaced.slice(i + 1),
        ])
  it('every example is flagged with its spaces', () => {
    const quiet = Object.entries(EXAMPLES).flatMap(([kind, lines]) =>
      lines.filter(l => !unbackedKinds(l, []).includes(kind as never))
    )
    expect(quiet).toEqual([])
  })
  it('covers every space of every example', () => {
    expect(rows.length).toBeGreaterThan(100)
  })
  it('a line break at any space keeps the family flagged', () => {
    const silent = rows.filter(
      ([kind, spaced, wrapped]) =>
        unbackedKinds(spaced, []).includes(kind as never) &&
        !unbackedKinds(wrapped, []).includes(kind as never)
    )
    expect(silent).toEqual([])
  })
  it('claimsBrowserWork reads a wrapped line the same way', () => {
    const silent = rows.filter(
      ([kind, , wrapped]) => kind === 'browser' && !claimsBrowserWork(wrapped)
    )
    expect(silent).toEqual([])
  })
  // the five answers of the round-3 review, flagged on main, silent on round 3
  for (const said of [
    'Зашла в кабинет, и на экране\nвижу форму оплаты.', // cyrillic-ok: test input
    'Сейчас проверяю\nвкладки, минутку.', // cyrillic-ok: test input
    'Хорошо, I\nclicked the button.', // cyrillic-ok: test input
    'Done, I am\nopening the page now.',
    'I took a\nscreenshot of it.',
  ]) {
    it(`a wrapped browser claim: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual(['browser'])
      expect(honestyNote(said, [text(said)])).toBe(HONESTY_NOTE)
    })
  }
})

/*
 * Every whitespace character but a line break is a plain space (#3728 round
 * 5). Round 4 listed " " and "\t" by hand where a clause breaks, so U+00A0
 * between a name and its verb ended the clause and the person's verb read
 * as the agent's. This puts every inline whitespace at every space of each
 * person row and each opener row: the verdict must be the plain-space one.
 */
describe('a no-break or any inline space reads as a plain space (#3728 round 5)', () => {
  const INLINE = ['\t', '\u00a0', '\u2009', '\u202f', '\u3000']
  // the round-4 review: silent on main, a needless note on round 4
  const REVIEW = [
    'Он прислал фото', // cyrillic-ok: test input
    'Анна прислала фото', // cyrillic-ok: test input
    'Она записала голосовое', // cyrillic-ok: test input
    'Клиент отправил видео', // cyrillic-ok: test input
    'Привет, Анна прислала фото', // cyrillic-ok: test input
    'Вчера Анна прислала фото', // cyrillic-ok: test input
  ]
  // honest person rows of the rounds above, and openers that must still claim
  const ROWS = [
    ...REVIEW,
    'Анна записала голосовое', // cyrillic-ok: test input
    'Мария отправила фото чека', // cyrillic-ok: test input
    'Вчера Анна записала голосовое.', // cyrillic-ok: test input
    'Короче, Анна прислала фото.', // cyrillic-ok: test input
    'Клиентка прислала голосовое.', // cyrillic-ok: test input
    'Кто-то скинул видео в чат.', // cyrillic-ok: test input
    'Вчера клиент прислал голосовое.', // cyrillic-ok: test input
    'Потом он озвучил текст для ролика.', // cyrillic-ok: test input
    '@anna прислала голосовое.', // cyrillic-ok: test input
    'Ольга прислала видео', // cyrillic-ok: test input
    'Менеджер отправил фото', // cyrillic-ok: test input
    'Сегодня Анна прислала фото чека', // cyrillic-ok: test input
    'Клиент прислал фото', // cyrillic-ok: test input
    'Иван сделал афишу.', // cyrillic-ok: test input
    'Клиентка Мария прислала фото.', // cyrillic-ok: test input
    'Елена Петровна отправила видео.', // cyrillic-ok: test input
    'Саша прислал фото', // cyrillic-ok: test input
    'Ксюша Петрова прислала фото', // cyrillic-ok: test input
    'Anna прислала фото', // cyrillic-ok: test input
    'John отправил видео', // cyrillic-ok: test input
    'Подруга Милослава прислала видео', // cyrillic-ok: test input
    'Пётр прислал видео.', // cyrillic-ok: test input
    'Анна Петрова прислала фото.', // cyrillic-ok: test input
    'Anna Smith прислала фото', // cyrillic-ok: test input
    'Менеджер Зорро отправил видео', // cyrillic-ok: test input
    'Ура Готово сделала афишу', // cyrillic-ok: test input
    'Ага сделала афишу', // cyrillic-ok: test input
    'Привет Анна Сделала афишу', // cyrillic-ok: test input
    'Анна Вот сделала афишу', // cyrillic-ok: test input
    'Я сделал афишу для тебя.', // cyrillic-ok: test input
    'Записал голосовое?', // cyrillic-ok: test input
  ]
  const rows: Array<[string, string]> = []
  for (const spaced of ROWS)
    for (let i = spaced.indexOf(' '); i >= 0; i = spaced.indexOf(' ', i + 1))
      for (const ws of INLINE)
        rows.push([spaced, spaced.slice(0, i) + ws + spaced.slice(i + 1)])
  it('covers every inline whitespace at every space', () => {
    expect(rows.length).toBe(490)
  })
  it('the honest rows are silent and the openers flagged with plain spaces', () => {
    const silent = ROWS.filter(r => unbackedKinds(r, []).length === 0)
    expect(silent.length).toBeGreaterThan(30)
    expect(ROWS.length - silent.length).toBe(6)
  })
  it('any inline whitespace gives the plain-space verdict', () => {
    const wrong = rows.filter(
      ([spaced, other]) =>
        JSON.stringify(unbackedKinds(other, [])) !==
        JSON.stringify(unbackedKinds(spaced, []))
    )
    expect(wrong).toEqual([])
  })
  // the greeting row is the agent's own by the round-3 greeting rule; the
  // others are someone else's. U+00A0 changes neither.
  for (const said of REVIEW)
    it(`U+00A0 between subject and verb: ${JSON.stringify(said)}`, () => {
      const nbsp = said.replace(/ (?=\S+ \S+$)/u, '\u00a0')
      expect(nbsp).toContain('\u00a0')
      const plain = said.startsWith('Привет') ? ['media'] : [] // cyrillic-ok: test input
      expect(unbackedKinds(said, [])).toEqual(plain)
      expect(unbackedKinds(nbsp, [])).toEqual(plain)
    })
})

/*
 * A Windows or old-Mac line break inside a claim is a line break (#3728
 * round 5). Round 4's reviewer made the CRLF fold a no-op and all tests
 * passed while 39 wrapped English claims went silent: "a\r\nscreenshot"
 * folds to two spaces, and the English patterns spell one.
 */
describe('a CRLF or a lone CR inside a claim keeps it flagged (#3728 round 5)', () => {
  for (const [said, kind] of [
    ['I took a\r\nscreenshot of it.', 'browser'],
    ['Done, I am\r\nopening the page now.', 'browser'],
    ['I made the\r\nposter for you.', 'media'],
    ['I recorded you a\r\nvoice note.', 'voice'],
    ['I took a\rscreenshot of it.', 'browser'],
    ['I made the\rposter for you.', 'media'],
    ['I recorded you a\rvoice note.', 'voice'],
  ] as const)
    it(`${kind}: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([kind])
    })
  it('claimsBrowserWork reads a CRLF the same way', () => {
    expect(claimsBrowserWork('I took a\r\nscreenshot of it.')).toBe(true)
  })
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

/*
 * The class, not the sites (#3728 round 6). Rounds 3-5 fixed exotic
 * whitespace one reader at a time, and each review found one more reader
 * (REFERS_BACK, the plan headers) still matching a plain space only. The
 * module now normalises once at every exported entry, and this enforces it:
 * EVERY string literal of this file that reads as an answer -- honest or a
 * claim -- must get the same verdict from every exported function when each
 * plain space becomes each inline whitespace, and each "\n" each line break.
 */
describe('whitespace is normalised once, at every entry (#3728 round 6)', () => {
  const INLINE = [
    '\t',
    '\u00a0',
    '\u2009',
    '\u202f',
    '\u3000',
    '\u2000',
    '\u1680',
    '\ufeff',
  ]
  const BREAKS = ['\r\n', '\r', '\u2028', '\u2029', '\u0085', '\v', '\f']
  const src = readFileSync(__filename, 'utf8')
  const literal = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g
  const corpus = [
    ...new Set(
      [...src.matchAll(literal)]
        .map(m => {
          try {
            return new Function(`return ${m[0]}`)() as string
          } catch {
            return ''
          }
        })
        .filter(s => /[ \n]/.test(s) && /\p{L}{2}/u.test(s))
    ),
  ]
  const events = [text('x'), call('crm_find')]
  const verdict = (said: string) =>
    JSON.stringify([
      claimsBrowserWork(said),
      unbackedClaims(said, events),
      unbackedKinds(said, events),
      honestyNote(said, events),
      honestyLogFields(said, events),
    ])
  const variants = (said: string) => [
    ...INLINE.map(ws => said.replaceAll(' ', ws)),
    // a "\n" that is half of a CRLF already is not a break of its own
    ...BREAKS.map(br => said.replace(/(?<!\r)\n/g, br)),
  ]
  it('reaches every answer of this file', () => {
    expect(corpus.length).toBeGreaterThan(380)
    expect(corpus.filter(s => s.includes('\n')).length).toBeGreaterThan(40)
    expect(
      corpus.filter(s => verdict(s) !== verdict('')).length
    ).toBeGreaterThan(100)
  })
  it('every exported function gives every variant the plain verdict', () => {
    const wrong: string[] = []
    for (const said of corpus) {
      const plain = verdict(said)
      for (const other of variants(said))
        if (verdict(other) !== plain) wrong.push(JSON.stringify(other))
    }
    expect(wrong).toEqual([])
  })

  // the round-5 review: a no-break space inside the "previous message" and the
  // plan headers gained a needless note
  for (const said of [
    'Отправила афишу в прошлом сообщении.', // cyrillic-ok: test input
    'По шагам:\n1. Сделала афишу для тебя', // cyrillic-ok: test input
    'Что я сделаю:\n- Записала голосовое для вас', // cyrillic-ok: test input
  ])
    it(`a no-break space inside a back-reference or a plan: ${JSON.stringify(said)}`, () => {
      const nbsp = said.replace(/ /g, '\u00a0')
      expect(nbsp).not.toBe(said)
      expect(unbackedKinds(nbsp, [])).toEqual([])
      expect(unbackedKinds(said, [])).toEqual([])
      expect(honestyNote(said, [])).toBe('')
      expect(honestyNote(nbsp, [])).toBe('')
    })

  // U+2028, U+2029 and U+0085 are line breaks: a plan header heads the list
  // under it (on one line it heads nothing), and a wrapped claim still claims
  for (const br of ['\u2028', '\u2029', '\u0085'])
    it(`U+${br.codePointAt(0)!.toString(16).padStart(4, '0')} is a line break`, () => {
      expect(unbackedKinds(`Шаги:${br}- сделала афишу`, [])).toEqual([]) // cyrillic-ok: test input
      expect(unbackedKinds('Шаги: - сделала афишу', [])).toEqual(['media']) // cyrillic-ok: test input
      expect(unbackedKinds(`I took a${br}screenshot of it.`, [])).toEqual([
        'browser',
      ])
      expect(
        claimsBrowserWork(`I made the${br}poster. I took a${br}screenshot.`)
      ).toBe(true)
      expect(unbackedKinds(`I recorded you a${br}voice note.`, [])).toEqual([
        'voice',
      ])
    })
})

/*
 * A gap between the verb and its object (#3734). The claim patterns wanted
 * the object right after the verb, so "Сделала Анне афишу" and "Отправила // cyrillic-ok: quoted input
 * вам только что голосовое" were silent -- the unsafe side. The gap is // cyrillic-ok: quoted input
 * bounded by the clause, not by a count. Grid: every claim verb of every
 * family that takes an object x every gap x every object noun of that
 * family; every row is flagged. The honest mirror puts the same rows in the
 * conditional, the future or the negative, and every one stays silent, as
 * on main.
 */
describe('a gap between verb and object stays inside the clause (#3734)', () => {
  type Family = 'browser' | 'media' | 'voice'
  // 'past/future' of each verb, the objects it takes, the family
  const RU: Array<[string[], string[], Family]> = [
    [
      [
        'сделал/сделаю', // cyrillic-ok: test input
        'сделала/сделаю', // cyrillic-ok: test input
        'нарисовал/нарисую', // cyrillic-ok: test input
        'нарисовала/нарисую', // cyrillic-ok: test input
        'создал/создам', // cyrillic-ok: test input
        'создала/создам', // cyrillic-ok: test input
        'сгенерировал/сгенерирую', // cyrillic-ok: test input
        'сгенерировала/сгенерирую', // cyrillic-ok: test input
        'подготовил/подготовлю', // cyrillic-ok: test input
        'подготовила/подготовлю', // cyrillic-ok: test input
      ],
      [
        'афишу', // cyrillic-ok: test input
        'картинку', // cyrillic-ok: test input
        'изображение', // cyrillic-ok: test input
        'постер', // cyrillic-ok: test input
        'обложку', // cyrillic-ok: test input
        'баннер', // cyrillic-ok: test input
      ],
      'media',
    ],
    [
      [
        'сделал/сделаю', // cyrillic-ok: test input
        'сделала/сделаю', // cyrillic-ok: test input
        'смонтировал/смонтирую', // cyrillic-ok: test input
        'смонтировала/смонтирую', // cyrillic-ok: test input
        'собрал/соберу', // cyrillic-ok: test input
        'собрала/соберу', // cyrillic-ok: test input
      ],
      [
        'видео', // cyrillic-ok: test input
        'ролик', // cyrillic-ok: test input
        'рилс', // cyrillic-ok: test input
      ],
      'media',
    ],
    [
      [
        'отправил/отправлю', // cyrillic-ok: test input
        'отправила/отправлю', // cyrillic-ok: test input
        'прислал/пришлю', // cyrillic-ok: test input
        'прислала/пришлю', // cyrillic-ok: test input
        'скинул/скину', // cyrillic-ok: test input
        'скинула/скину', // cyrillic-ok: test input
      ],
      [
        'фото', // cyrillic-ok: test input
        'картинку', // cyrillic-ok: test input
        'афишу', // cyrillic-ok: test input
        'постер', // cyrillic-ok: test input
        'видео', // cyrillic-ok: test input
        'ролик', // cyrillic-ok: test input
        'файл', // cyrillic-ok: test input
      ],
      'media',
    ],
    [
      [
        'записал/запишу', // cyrillic-ok: test input
        'записала/запишу', // cyrillic-ok: test input
        'отправил/отправлю', // cyrillic-ok: test input
        'отправила/отправлю', // cyrillic-ok: test input
        'прислал/пришлю', // cyrillic-ok: test input
        'прислала/пришлю', // cyrillic-ok: test input
        'скинул/скину', // cyrillic-ok: test input
        'скинула/скину', // cyrillic-ok: test input
        'озвучил/озвучу', // cyrillic-ok: test input
        'озвучила/озвучу', // cyrillic-ok: test input
      ],
      [
        'голосовое', // cyrillic-ok: test input
        'аудио', // cyrillic-ok: test input
        'войс', // cyrillic-ok: test input
      ],
      'voice',
    ],
    [
      [
        'озвучил/озвучу', // cyrillic-ok: test input
        'озвучила/озвучу', // cyrillic-ok: test input
      ],
      [
        'текст', // cyrillic-ok: test input
        'пост', // cyrillic-ok: test input
        'сценарий', // cyrillic-ok: test input
        'ответ', // cyrillic-ok: test input
        'сообщение', // cyrillic-ok: test input
        'письмо', // cyrillic-ok: test input
      ],
      'voice',
    ],
    [
      [
        'открываю/открою', // cyrillic-ok: test input
        'открыл/открою', // cyrillic-ok: test input
        'открылась/откроется', // cyrillic-ok: test input
        'открылся/откроется', // cyrillic-ok: test input
      ],
      [
        'страницу', // cyrillic-ok: test input
        'сайт', // cyrillic-ok: test input
        'вкладку', // cyrillic-ok: test input
        'linkedin', // cyrillic-ok: test input
        'x.com', // cyrillic-ok: test input
        'google', // cyrillic-ok: test input
      ],
      'browser',
    ],
    [
      [
        'делаю/сделаю', // cyrillic-ok: test input
        'сделал/сделаю', // cyrillic-ok: test input
      ],
      [
        'снимок', // cyrillic-ok: test input
        'скриншот', // cyrillic-ok: test input
      ],
      'browser',
    ],
    [
      [
        'читаю/прочитаю', // cyrillic-ok: test input
        'прочитал/прочитаю', // cyrillic-ok: test input
      ],
      [
        'текст', // cyrillic-ok: test input
        'страницу', // cyrillic-ok: test input
      ],
      'browser',
    ],
    [
      [
        'проверяю/проверю', // cyrillic-ok: test input
        'смотрю/посмотрю', // cyrillic-ok: test input
      ],
      [
        'вкладки', // cyrillic-ok: test input
        'все вкладки', // cyrillic-ok: test input
      ],
      'browser',
    ],
  ]
  const RU_GAPS = [
    '',
    'вам',
    'тебе',
    'ей',
    'Анне',
    'Ивану',
    'только что',
    'уже',
    'вам только что',
    'Анне уже',
    'тебе сегодня утром',
    'Ивану Петрову уже',
  ] // cyrillic-ok: test input
  // verb, its base form, the objects it takes, the family
  const EN: Array<[string, string, string[], Family]> = [
    ...['made', 'created', 'generated', 'drew'].map(
      (v): [string, string, string[], Family] => [
        v,
        {
          made: 'make',
          created: 'create',
          generated: 'generate',
          drew: 'draw',
        }[v]!,
        [
          'the poster',
          'an image',
          'a picture',
          'your banner',
          'the cover',
          'a video',
          'poster',
        ],
        'media',
      ]
    ),
    [
      'recorded',
      'record',
      ['a voice note', 'the audio', 'your voice message', 'an audio clip'],
      'voice',
    ],
    [
      'sent',
      'send',
      ['a voice note', 'the audio', 'your voice message', 'an audio clip'],
      'voice',
    ],
    ['took', 'take', ['a screenshot'], 'browser'],
  ]
  const EN_GAPS = [
    '',
    'you',
    'her',
    'Anna',
    'Ivan',
    'just now',
    'already',
    'you just now',
    'Anna already',
    'you this morning',
  ]
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

  const claims: Array<[string, Family]> = []
  const honest: string[] = []
  for (const [verbs, objects, family] of RU)
    for (const pair of verbs)
      for (const gap of RU_GAPS)
        for (const obj of objects) {
          const [verb, future] = pair.split('/')
          claims.push([cap(join(verb, gap, obj)) + '.', family])
          honest.push(cap(join(future, gap, obj)) + '.')
          // the conditional: only a past form takes it
          if (!verb.endsWith('ю'))
            // cyrillic-ok: matched letter
            honest.push(cap(join(verb, 'бы', gap, obj)) + ', если хотите.') // cyrillic-ok: test input
          // the negative: the media and voice patterns refuse it before the verb
          if (family !== 'browser')
            honest.push(cap(join('не', verb, gap, obj)) + '.') // cyrillic-ok: test input
        }
  for (const [verb, base, objects, family] of EN)
    for (const gap of EN_GAPS)
      for (const obj of objects) {
        claims.push([join('I', verb, gap, obj) + '.', family])
        honest.push(join('I will', base, gap, obj) + '.')
        honest.push(join('I could', base, gap, obj) + ' if you like.')
        honest.push(join('Shall I', base, gap, obj) + '?')
      }

  it('covers every verb, gap and object', () => {
    expect(claims.length).toBe(2746)
    expect(honest.length).toBe(7638)
  })
  // main: 567 of 2746 flagged, every gapped row silent; 0 of 7638 honest noted
  it('every claim row is flagged for its family', () => {
    const silent = claims.filter(
      ([said, family]) => !unbackedKinds(said, []).includes(family)
    )
    expect(silent).toEqual([])
  })
  it('claimsBrowserWork reads the gap the same way', () => {
    const silent = claims.filter(
      ([said, family]) => family === 'browser' && !claimsBrowserWork(said)
    )
    expect(silent).toEqual([])
    expect(honest.filter(said => claimsBrowserWork(said))).toEqual([])
  })
  it('every honest mirror row stays silent, as on main', () => {
    const noted = honest.filter(said => unbackedKinds(said, []).length > 0)
    expect(noted).toEqual([])
  })

  // the issue's lines, and a gap wrapped onto the next line (round 4)
  for (const [said, kind] of [
    ['Сделала Анне афишу', 'media'], // cyrillic-ok: test input
    ['Отправила вам только что голосовое', 'voice'], // cyrillic-ok: test input
    ['I sent you the voice note just now', 'voice'],
    ['I sent her just now the voice note', 'voice'],
    ['I made you a poster.', 'media'],
    ['Отправила Ивану Петрову видео.', 'media'], // cyrillic-ok: test input
    ['Отправила вам\nтолько что голосовое', 'voice'], // cyrillic-ok: test input
    ['Сделала для Анны новую афишу.', 'media'], // cyrillic-ok: test input
    ['Отправила вам 3 фото.', 'media'], // cyrillic-ok: test input
    ['Сделала Анне афишу — как тебе?', 'media'], // cyrillic-ok: test input
    ['Открыл вам только что страницу входа.', 'browser'], // cyrillic-ok: test input
  ] as const)
    it(`a gapped claim is flagged: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([kind])
    })

  // each bound of the gap, silent on main and silent now
  for (const said of [
    // a clause break: "и", a line break before a capital // cyrillic-ok: quoted input
    'Отправила текст и пришлю фото позже.', // cyrillic-ok: test input
    'Сделала макет и нарисую афишу завтра.', // cyrillic-ok: test input
    'Записала текст\nГолосовое пришлю вечером.', // cyrillic-ok: test input
    'Открыл почту и потом страницу проверю.', // cyrillic-ok: test input
    // a conditional or a new clause
    'Сделала бы вам афишу, если хотите.', // cyrillic-ok: test input
    'Отправила текст, а видео позже.', // cyrillic-ok: test input
    'Записала текст но голосовое не успела.', // cyrillic-ok: test input
    'Сделал бы вам скриншот, но браузер закрыт.', // cyrillic-ok: test input
    'I recorded the call and will send a voice note.',
    'I made the text but could make a poster too.',
    // the object governed by a preposition
    'Отправила вам ссылку на фото.', // cyrillic-ok: test input
    'Сделала текст для афиши.', // cyrillic-ok: test input
    'Сделала всё кроме афиши.', // cyrillic-ok: test input
    'I sent you the link to the audio.',
    'I made a note about the poster.',
    // someone else's verb, inverted
    'Прислала Анна фото чека.', // cyrillic-ok: test input
    'Отправил клиент видео с примеркой.', // cyrillic-ok: test input
    'Записала Мария голосовое с адресом.', // cyrillic-ok: test input
    'Скинул он вам файл вчера.', // cyrillic-ok: test input
    // the modal, the future and the question keep winning
    'Могу отправить вам голосовое.', // cyrillic-ok: test input
    'Хотите, сделаю Анне афишу?', // cyrillic-ok: test input
    'Отправила вам только что голосовое?', // cyrillic-ok: test input
  ])
    it(`the gap ends at its clause: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
      expect(claimsBrowserWork(said)).toBe(false)
    })
})

/*
 * #3734 round 2: the gap swallowed the verb's real object. "Сделала // cyrillic-ok: quoted input
 * сценарий видео" made a script, not a video; round 1 read the document noun // cyrillic-ok: quoted input
 * as a gap and the media noun after it as the object. The reviewer's corpus
 * of honest answers a content agent gives, rebuilt: document nouns with a
 * media genitive, questions, imperatives, quotes, archive finds, "бы", // cyrillic-ok: quoted input
 * comma clauses, someone else's verb, the future. No tool was called in any
 * of them, so every note is a needless one.
 */
describe('a document noun in the gap is the real object (#3734 round 2)', () => {
  const HONEST = [
    'Сделала сценарий видео', // cyrillic-ok: test input
    'Сделала текст афиши', // cyrillic-ok: test input
    'Сделала раскадровку видео', // cyrillic-ok: test input
    'Записала текст голосового', // cyrillic-ok: test input
    'Отправила вам описание ролика', // cyrillic-ok: test input
    'Подготовила бриф баннера', // cyrillic-ok: test input
    'Сделала вам подборку референсов афиши', // cyrillic-ok: test input
    'Сделала вам расчёт стоимости видео', // cyrillic-ok: test input
    'Отправила вам прайс съёмки видео', // cyrillic-ok: test input
    'Отправила вам ссылку на оплату видео', // cyrillic-ok: test input
    'Записала пожелания насчёт голосового', // cyrillic-ok: test input
    'I made sure the poster is right',
    'I created a brief describing the poster',
    'I made the text shorter so the banner fits',
    'Подготовила план рилса', // cyrillic-ok: test input
    'Сделала обложку для видео', // cyrillic-ok: test input
    'Написала сценарий ролика', // cyrillic-ok: test input
    'Сделала текст поста для рилса', // cyrillic-ok: test input
    'Подготовила вам смету видео', // cyrillic-ok: test input
    'Отправила вам договор на съёмку видео', // cyrillic-ok: test input
    'Сделала таблицу постов', // cyrillic-ok: test input
    'Составила вам контент-план рилсов', // cyrillic-ok: test input
    'Сделала заметку про афишу', // cyrillic-ok: test input
    'Записала адрес съёмки видео', // cyrillic-ok: test input
    'Отправила вам счёт за видео', // cyrillic-ok: test input
    'Сделала вам скидку на афишу', // cyrillic-ok: test input
    'Отправила вам промокод на видео', // cyrillic-ok: test input
    'Прислала вам инструкцию по записи голосового', // cyrillic-ok: test input
    'Сделала черновик подписи к фото', // cyrillic-ok: test input
    'Подготовила вам вопросы к видео', // cyrillic-ok: test input
    'Сделала вам напоминание о съёмке видео', // cyrillic-ok: test input
    'Сделала список идей для рилса', // cyrillic-ok: test input
    'Отправила вам расписание съёмок видео', // cyrillic-ok: test input
    'Записала вас на съёмку видео', // cyrillic-ok: test input
    'Сделала бронь на съёмку видео', // cyrillic-ok: test input
    'Отправила вам тексты для афиши', // cyrillic-ok: test input
    'Сделать вам афишу?', // cyrillic-ok: test input
    'Записать вам голосовое?', // cyrillic-ok: test input
    'Отправить видео сейчас?', // cyrillic-ok: test input
    'Вы получили видео?', // cyrillic-ok: test input
    'Прислать вам фото примеров?', // cyrillic-ok: test input
    'Сделала афишу?', // cyrillic-ok: test input
    'Хотите, сделаю вам обложку?', // cyrillic-ok: test input
    'Can I make you a poster?',
    'Did you get the video?',
    'Отправьте мне фото, пожалуйста.', // cyrillic-ok: test input
    'Пришлите голосовое с пожеланиями.', // cyrillic-ok: test input
    'Сделайте скриншот страницы.', // cyrillic-ok: test input
    'Скиньте видео, я посмотрю.', // cyrillic-ok: test input
    'Send me the poster when it is ready.',
    'Please record a voice note for me.',
    'Вы написали «сделала вам афишу» — это про прошлый заказ?', // cyrillic-ok: test input
    'Клиентка пишет: "отправила вам видео".', // cyrillic-ok: test input
    'В шаблоне стоит «Отправила вам голосовое».', // cyrillic-ok: test input
    'Нашла в архиве ваше видео.', // cyrillic-ok: test input
    'Нашла в архиве афишу прошлого года.', // cyrillic-ok: test input
    'Нашла ваше голосовое в переписке.', // cyrillic-ok: test input
    'Сделала бы вам афишу, если хотите.', // cyrillic-ok: test input
    'Я бы отправила видео завтра.', // cyrillic-ok: test input
    'Записала бы голосовое, но микрофон недоступен.', // cyrillic-ok: test input
    'Сделала текст, видео будет завтра.', // cyrillic-ok: test input
    'Записала пожелания, голосовое пришлю позже.', // cyrillic-ok: test input
    'Отправила ссылку, афишу доделаю вечером.', // cyrillic-ok: test input
    'Подготовила сценарий, а ролик соберу после согласования.', // cyrillic-ok: test input
    'Анна прислала фото чека.', // cyrillic-ok: test input
    'Клиент отправил видео с примеркой.', // cyrillic-ok: test input
    'Не сделала афишу, Kie недоступен.', // cyrillic-ok: test input
    'Сделаю вам афишу через пять минут.', // cyrillic-ok: test input
    'Пришлю видео, как только будет готово.', // cyrillic-ok: test input
    'Могу записать голосовое.', // cyrillic-ok: test input
    'Видео ещё в работе.', // cyrillic-ok: test input
    'Афиша будет готова завтра.', // cyrillic-ok: test input
    'Отправила вам вопросы по видео.', // cyrillic-ok: test input
    'Сделала текст для афиши.', // cyrillic-ok: test input
    'Отправила вам ссылку на фото.', // cyrillic-ok: test input
    'Записала время съёмки ролика.', // cyrillic-ok: test input
    'Подготовила тезисы для голосового.', // cyrillic-ok: test input
    'Сделала вам описание фото для каталога.', // cyrillic-ok: test input
    'Отправила вам текст голосового сообщения.', // cyrillic-ok: test input
    'Скинула вам расшифровку голосового.', // cyrillic-ok: test input
    'Отправила вам примеры видео других мастеров.', // cyrillic-ok: test input
    'Прислала вам отзывы о фото.', // cyrillic-ok: test input
    'I made a list of ideas for the video.',
    'I wrote the script of the video.',
    'I sent you the link to the audio.',
    'I made a note about the poster.',
    'I will make the poster tomorrow.',
    'I could record a voice note if you like.',
    'I made certain the video link works.',
    'I made it so the banner opens on tap.',
    'I created a draft caption for the image.',
    'I sent you the price of the video.',
    'I made the brief for the cover.',
    'I made changes to the poster text.',
    'I recorded your wishes for the voice note.',
    'I generated ideas for the banner.',
    'I sent the client a quote for the video.',
  ]
  // measured on main (#3734 round 2): 2 of 97 noted, neither through a gap --
  // "Сделала обложку для видео" claims a cover, and "Я бы отправила видео // cyrillic-ok: quoted input
  // завтра." reads "бы" before the verb as the agent's past. Round 1: 26. // cyrillic-ok: quoted input
  const MAIN_NOTED = 2
  it("the corpus is the reviewer's size", () => {
    expect(HONEST.length).toBe(97)
  })
  it("needless notes stay at main's count, within two", () => {
    const noted = HONEST.filter(
      said => unbackedKinds(said, []).length > 0 || claimsBrowserWork(said)
    )
    expect(noted.length).toBeLessThanOrEqual(MAIN_NOTED + 2)
  })

  // the review's seven, each silent on main
  for (const said of [
    'Сделала сценарий видео', // cyrillic-ok: test input
    'Сделала текст афиши', // cyrillic-ok: test input
    'Сделала раскадровку видео', // cyrillic-ok: test input
    'Записала текст голосового', // cyrillic-ok: test input
    'Отправила вам описание ролика', // cyrillic-ok: test input
    'Отправила вам ссылку на оплату видео', // cyrillic-ok: test input
    'I made sure the poster is right',
    'I made certain the video link works.',
    'I made it so the banner opens on tap.',
  ])
    it(`the verb's own object ends the gap: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  // the family the review asked for: verb + gap + document noun + media
  // genitive. Every verb of the media and voice families, silent in all.
  const VERBS: Array<[string[], string[]]> = [
    [
      ['Сделала', 'Подготовила', 'Создала', 'Нарисовала'], // cyrillic-ok: test input
      ['афиши', 'обложки', 'баннера', 'постера', 'картинки'], // cyrillic-ok: test input
    ],
    [
      ['Сделала', 'Смонтировала', 'Собрала'], // cyrillic-ok: test input
      ['видео', 'ролика', 'рилса'], // cyrillic-ok: test input
    ],
    [
      ['Отправила', 'Прислала', 'Скинула'], // cyrillic-ok: test input
      ['видео', 'фото', 'афиши', 'ролика', 'файла'], // cyrillic-ok: test input
    ],
    [
      ['Записала', 'Отправила', 'Прислала'], // cyrillic-ok: test input (the voicing verb + text is a claim by itself)
      ['голосового', 'аудио'], // cyrillic-ok: test input
    ],
  ]
  const GAPS = ['', 'вам', 'Анне уже'] // cyrillic-ok: test input
  const HEADS = [
    'сценарий',
    'текст',
    'описание',
    'план',
    'раскадровку',
    'ссылку на оплату',
    'расчёт стоимости',
  ] // cyrillic-ok: test input
  const rows: string[] = []
  for (const [verbs, objects] of VERBS)
    for (const verb of verbs)
      for (const gap of GAPS)
        for (const head of HEADS)
          for (const obj of objects)
            rows.push([verb, gap, head, obj].filter(Boolean).join(' ') + '.')
  it('a document noun before a media genitive is never noted', () => {
    expect(rows.length).toBe(1050)
    expect(rows.filter(said => unbackedKinds(said, []).length > 0)).toEqual([])
  })
})

/*
 * Plural objects (#3744). "I generated two images" stopped at "image" + "s"
 * and stayed silent. Every English media noun the module knows, singular
 * and plural, under every claim verb, is flagged; its plan, question,
 * negation and other-subject mirror stays silent. Russian matched by stem
 * already; the rows below pin that, plus the "вот ..." openers. // cyrillic-ok: quoted input
 */
describe('a plural object is a claim like a singular one (#3744)', () => {
  // the issue's lines, silent on main
  for (const [said, kind] of [
    ['I generated two images.', 'media'],
    ['I generated two posters.', 'media'],
    ['I made you three banners.', 'media'],
    ["I've created four new covers for you.", 'media'],
    ['Here are your posters.', 'media'],
    ['I sent you two voice notes.', 'voice'],
    ['I recorded three audio clips.', 'voice'],
    ['Your voice notes are ready.', 'voice'],
    ['Here are the voice messages.', 'voice'],
    ['The voice notes have been sent.', 'voice'],
    ['Вот твои постеры.', 'media'], // cyrillic-ok: test input
    ['Вот готовые афиши.', 'media'], // cyrillic-ok: test input
    ['Сделала три новых постера.', 'media'], // cyrillic-ok: test input
    ['Вот твои голосовые.', 'voice'], // cyrillic-ok: test input
    ['Голосовые готовы.', 'voice'], // cyrillic-ok: test input
  ] as const)
    it(`flags ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([kind])
    })

  // Russian plurals that already held on main, pinned
  for (const [said, kind] of [
    ['Сделала тебе две афиши.', 'media'], // cyrillic-ok: test input
    ['Отправила вам постеры.', 'media'], // cyrillic-ok: test input
    ['Сделала три картинки.', 'media'], // cyrillic-ok: test input
    ['Сгенерировала изображения.', 'media'], // cyrillic-ok: test input
    ['Сделала обложки и баннеры.', 'media'], // cyrillic-ok: test input
    ['Отправила вам видео.', 'media'], // cyrillic-ok: test input
    ['Отправила вам фото.', 'media'], // cyrillic-ok: test input
    ['Собрала два ролика.', 'media'], // cyrillic-ok: test input
    ['Смонтировала рилсы.', 'media'], // cyrillic-ok: test input
    ['Скинула файлы.', 'media'], // cyrillic-ok: test input
    ['Вот ваши афиши.', 'media'], // cyrillic-ok: test input
    ['Записала два голосовых.', 'voice'], // cyrillic-ok: test input
    ['Отправила вам голосовые.', 'voice'], // cyrillic-ok: test input
  ] as const)
    it(`a Russian plural already held: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([kind])
    })

  // honest plurals, and the issue's negative controls
  for (const said of [
    'I will generate two images.',
    'Should I generate two posters?',
    'You generated two images.',
    "I didn't generate the images.",
    "I made two posters' worth of notes.",
    'I sent you links to the images.',
    "I made the poster's caption.",
    'Should I send you two voice notes?',
    'Your voice notes were lovely.',
    'Сделать тебе две афиши?', // cyrillic-ok: test input
    'Не сделала постеры.', // cyrillic-ok: test input
    'Вот твои тексты для афиш.', // cyrillic-ok: test input
  ])
    it(`stays silent: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  // the grid: every English media noun x {singular, plural} x every verb
  const NOUNS: Array<[string, string, readonly string[]]> = [
    ['poster', 'posters', ['made', 'created', 'generated', 'drew']],
    ['image', 'images', ['made', 'created', 'generated', 'drew']],
    ['picture', 'pictures', ['made', 'created', 'generated', 'drew']],
    ['banner', 'banners', ['made', 'created', 'generated', 'drew']],
    ['cover', 'covers', ['made', 'created', 'generated', 'drew']],
    ['video', 'videos', ['made', 'created', 'generated']],
  ]
  const BASE: Record<string, string> = {
    made: 'make',
    created: 'create',
    generated: 'generate',
    drew: 'draw',
  }
  const SUBJECTS = ['I', "I've", 'I have']
  const claims: string[] = []
  const mirrors: string[] = []
  for (const [one, many, verbs] of NOUNS)
    for (const [noun, dets] of [
      [one, ['the', 'you the', 'your']],
      [many, ['two', 'you three new', 'your', 'all the']],
    ] as const)
      for (const verb of verbs)
        for (const det of dets) {
          const object = `${det} ${noun}`
          for (const who of SUBJECTS) {
            const v = who === 'I' ? verb : verb === 'drew' ? 'drawn' : verb
            claims.push(`${who} ${v} ${object}.`)
          }
          const base = BASE[verb]
          mirrors.push(
            `I will ${base} ${object}.`,
            `Should I ${base} ${object}?`,
            `Shall I ${base} ${object}?`,
            `I didn't ${base} ${object}.`,
            `I can ${base} ${object} tomorrow.`,
            `You ${verb} ${object}.`,
            `Anna ${verb} ${object}.`
          )
        }
  it('every noun x number x verb claim is flagged', () => {
    expect(claims.length).toBe(483)
    expect(claims.filter(c => !unbackedKinds(c, []).includes('media'))).toEqual(
      []
    )
  })
  it('every plan, question, negation and other-subject mirror is silent', () => {
    expect(mirrors.length).toBe(1127)
    expect(mirrors.filter(m => unbackedKinds(m, []).length > 0)).toEqual([])
  })

  // the "here" opener, singular and plural, for every picture noun
  const HERE: string[] = []
  for (const [one, many] of NOUNS.slice(0, 5))
    for (const lead of [
      "Here's the",
      'Here is your',
      'Here are the',
      'Here are your',
    ])
      HERE.push(`${lead} ${lead.includes('are') ? many : one}.`)
  it('every "here is / here are" picture line is flagged', () => {
    expect(HERE.length).toBe(20)
    expect(HERE.filter(h => !unbackedKinds(h, []).includes('media'))).toEqual(
      []
    )
  })
})

/*
 * Number agreement (#3748 round 2). "here are" + EN_IMAGE took the
 * singular too, and after "are" a singular noun is only a modifier:
 * "Here are the poster ideas:" lists ideas, it hands over no poster. Main
 * stayed silent on each line below; round 1 flagged every one.
 */
describe('"here is" takes the singular, "here are" the plural (#3748 round 2)', () => {
  for (const said of [
    'Here are the poster ideas:',
    'Here are your poster options:',
    'Here are the banner sizes for Telegram:',
    'Here are your cover options:',
    'Here are the picture requirements:',
    'Here are the image sizes Instagram accepts: 1080x1080 and 1080x1350.',
    'Here are the cover letter tips you asked for.',
    'Here are the poster texts:',
    // the same defect in the voice opener and the Russian one
    'Here are the voice note tips:',
    'Here are your voice message options:',
    'Here are the voice reply templates.',
    'Here are the audio settings:',
    "Here are the posters' captions:",
    'Вот твои постерные идеи.', // cyrillic-ok: test input
    'Вот готовые афишные шаблоны.', // cyrillic-ok: test input
    'Вот ваши баннерные размеры.', // cyrillic-ok: test input
  ])
    it(`stays silent: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  it('"Here are the posters." still flags', () => {
    expect(unbackedKinds('Here are the posters.', [])).toEqual(['media'])
  })

  // the grid: every English noun x {here's, here is, here are} x {singular,
  // plural}. An agreeing pair is a claim; "here are" + a singular noun + the
  // real object is a list and stays silent.
  type Kind = 'media' | 'voice'
  const GRID: Array<[string, string, Kind]> = [
    ...['poster', 'image', 'picture', 'banner', 'cover'].map(
      (n): [string, string, Kind] => [n, `${n}s`, 'media']
    ),
    ...[
      ['note', 'notes'],
      ['message', 'messages'],
      ['reply', 'replies'],
      ['clip', 'clips'],
    ].map(([one, many]): [string, string, Kind] => [
      `voice ${one}`,
      `voice ${many}`,
      'voice',
    ]),
  ]
  const agreeing: Array<[string, Kind]> = []
  const modifiers: string[] = []
  for (const [one, many, kind] of GRID)
    for (const det of ['the', 'your']) {
      for (const lead of ["Here's", 'Here is'])
        agreeing.push([`${lead} ${det} ${one}.`, kind])
      agreeing.push([`Here are ${det} ${many}.`, kind])
      for (const head of ['ideas', 'options', 'sizes', 'texts'])
        modifiers.push(`Here are ${det} ${one} ${head}:`)
    }
  it('every agreeing "here" line is flagged with its kind', () => {
    expect(agreeing.length).toBe(54)
    expect(
      agreeing.filter(([said, kind]) => !unbackedKinds(said, []).includes(kind))
    ).toEqual([])
  })
  it('every "here are" + singular modifier + noun line stays silent', () => {
    expect(modifiers.length).toBe(72)
    expect(modifiers.filter(m => unbackedKinds(m, []).length > 0)).toEqual([])
  })
})

/*
 * A media noun used as a modifier (#3753). "Here is the poster idea:" hands
 * over an idea, "I sent you the voice notes transcript" a transcript: the
 * media noun modifies the head noun after it. Only a closed list of head
 * nouns silences the claim (HEAD_NOUNS in the module); any other following
 * word still flags, since a missed claim is the worse failure.
 */
describe('a media noun before a head noun is a modifier (#3753)', () => {
  for (const said of [
    'Here is the poster idea:',
    'Here is the poster text:',
    'I sent you the voice notes transcript.',
    'I recorded your voice preferences.',
    "Here's the image prompt I would use.",
    "Here's the cover concept, tell me if you like it.",
    'Here is your banner text draft.',
    'Here is the audio plan.',
    'Here is the poster copy for the launch.',
    'Here is your cover letter.',
    'I made the poster-text shorter.',
    'Вот твоё голосовое мнение.', // cyrillic-ok: test input
    'Вот ваши голосовые настройки:', // cyrillic-ok: test input
  ])
    it(`stays silent: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([])
    })

  for (const [said, kind] of [
    ['Here is the poster.', 'media'],
    ["Here's the poster, ready to post.", 'media'],
    ['I made the poster for your launch.', 'media'],
    ['Here are the posters.', 'media'],
    ['I sent you the voice note.', 'voice'],
    ['I made the poster text bigger and here is the poster.', 'media'],
    // a head the list leaves out on purpose: a draft or mockup is a picture
    ['Here is the poster draft.', 'media'],
    ['Here is the cover mockup.', 'media'],
    ['I made two poster copies.', 'media'],
    // a song cover is audio no call made, a poster of a photo is a poster
    ['I made a cover of the song.', 'media'],
    ['I made a poster of your photo.', 'media'],
    ['Вот твоё голосовое сообщение.', 'voice'], // cyrillic-ok: test input
    ['Вот твоё голосовое.', 'voice'], // cyrillic-ok: test input
    ['Записала тебе голосовое описание.', 'voice'], // cyrillic-ok: test input
  ] as const)
    it(`still flags: ${JSON.stringify(said)}`, () => {
      expect(unbackedKinds(said, [])).toEqual([kind])
    })

  // the grid: every media noun x every head noun x every opener, and the
  // same line without the head noun, which must stay flagged
  const HEADS = [
    'idea',
    'text',
    'prompt',
    'concept',
    'plan',
    'option',
    'size',
    'transcript',
    'preference',
    'template',
    'description',
    'caption',
    'brief',
    'script',
    'requirement',
    'tip',
    'format',
    'style',
    'list',
    'outline',
    'spec',
    'setting',
    'letter',
  ]
  type Kind = 'media' | 'voice'
  const silent: string[] = []
  const flagged: Array<[string, Kind]> = []
  const both = (claim: string, head: string, kind: Kind, end = '.') => {
    silent.push(`${claim} ${head}${end}`)
    flagged.push([`${claim}${end}`, kind])
  }
  const PICTURES = ['poster', 'image', 'picture', 'banner', 'cover']
  for (const head of HEADS)
    for (const many of [false, true]) {
      const h = many ? `${head}s` : head
      for (const det of ['the', 'your']) {
        for (const noun of PICTURES) {
          if (!many)
            for (const lead of ["Here's", 'Here is'])
              both(`${lead} ${det} ${noun}`, h, 'media', ':')
          for (const verb of ['made', 'created', "I've generated"])
            both(
              `${verb.startsWith('I') ? verb : `I ${verb}`} ${det} ${noun}`,
              h,
              'media'
            )
        }
        both(`I made ${det} video`, h, 'media')
        if (!many) both(`Here is ${det} audio`, h, 'voice')
        both(`I recorded ${det} audio`, h, 'voice')
        both(`I recorded ${det} voice`, h, 'voice')
        for (const voice of ['note', 'notes', 'message', 'reply', 'clip'])
          for (const verb of ['sent you', 'recorded'])
            both(`I ${verb} ${det} voice ${voice}`, h, 'voice')
      }
    }
  // "copy" is a head only in the singular
  both('Here is the poster', 'copy', 'media')
  it('every media noun + head noun line stays silent', () => {
    expect(silent.length).toBe(3083)
    expect(silent.filter(s => unbackedKinds(s, []).length > 0)).toEqual([])
  })
  it('the same line without the head noun is flagged with its kind', () => {
    expect(flagged.length).toBe(3083)
    expect(
      flagged.filter(([s, kind]) => !unbackedKinds(s, []).includes(kind))
    ).toEqual([])
  })
})

/*
 * Usability corpus for #3753: realistic honest replies about media that
 * claim nothing, and real claims. On main the honest side drew 22 needless
 * notes of 32 and the claims were caught 16 of 16; this head draws 0 and
 * still catches 16.
 */
describe('the #3753 usability corpus', () => {
  const HONEST = [
    'Here is the poster idea: a dark stage, one spotlight, your name in gold.',
    'Here is the poster text: "Live on Friday, 8 pm".',
    'I sent you the voice notes transcript.',
    'I recorded your voice preferences: calm, low, no music.',
    "Here's the image prompt I would use: a neon street at night.",
    "Here's the cover concept, tell me if you like it.",
    'Here is your banner text draft.',
    'Here is the audio plan.',
    'Here are the poster ideas:',
    'Here is the video script for the reel.',
    'Here is the cover letter for the job.',
    'Here is the banner size Telegram accepts: 1280x720.',
    'Here is the image description for alt text.',
    'Here is your poster caption.',
    'Here is the poster brief I would send a designer.',
    'I made the poster text shorter, as you asked.',
    'I created the video outline: hook, story, call to action.',
    'Here is the voice message template for new clients.',
    'Here is the picture format Instagram prefers.',
    'Here is the poster style I suggest: noir, high contrast.',
    'I will make the poster after you confirm the text.',
    'Should I make the poster now?',
    'Shall I record a voice note?',
    'Here is the poster copy for the launch.',
    'Here are the image requirements:',
    'Here is the audio settings list.',
    'Вот твоё голосовое мнение.', // cyrillic-ok: test input
    'Вот ваши голосовые настройки:', // cyrillic-ok: test input
    'Сделаю афишу, когда пришлёшь фото.', // cyrillic-ok: test input
    'Here is the plan: first the poster, then the reel.',
    'Your voice note said you want a red poster.',
    'I can make the cover tomorrow.',
  ]
  const CLAIMS = [
    'Here is the poster.',
    "Here's the poster, ready to post.",
    'I made the poster for your launch.',
    'Here are the posters.',
    'I sent you the voice note.',
    'I made the poster text bigger and here is the poster.',
    'Here is the poster draft.',
    'I made a cover of the song.',
    'I recorded a voice message for you.',
    'Here is your banner.',
    "Here's the audio.",
    'I generated two images.',
    'I made the video, take a look.',
    'Вот твоё голосовое.', // cyrillic-ok: test input
    'Записала голосовое.', // cyrillic-ok: test input
    'Сделала афишу, держи.', // cyrillic-ok: test input
  ]
  it('no honest reply draws a note', () => {
    expect(HONEST.length).toBe(32)
    expect(HONEST.filter(s => unbackedKinds(s, []).length > 0)).toEqual([])
  })
  it('every claim is still caught', () => {
    expect(CLAIMS.length).toBe(16)
    expect(CLAIMS.filter(s => unbackedKinds(s, []).length === 0)).toEqual([])
  })
})
