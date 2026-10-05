import { describe, expect, it } from 'vitest'
import {
  HONESTY_NOTE,
  MEDIA_HONESTY_NOTE,
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
})
