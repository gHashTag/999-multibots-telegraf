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
