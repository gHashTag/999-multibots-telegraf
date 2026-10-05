import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HONESTY_NOTE,
  MEDIA_HONESTY_NOTE,
  MEDIA_TOOLS,
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
  audio_generate: 'sound; no claim pattern reads sound yet',
  voice_clone_speak: 'sound; no claim pattern reads sound yet',
}

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
      n => !MEDIA_TOOLS.includes(n) && !(n in NOT_A_MEDIA_RESULT)
    )
    expect(loose).toEqual([])
  })
})
