/**
 * Spec agent-claims-honest.t27 (gHashTag/t27#8082), every test block run
 * against the compiled logic the host calls, then the 2026-10-09 turns of
 * the Director replayed (#3921): "Done! Link:" after an image_edit that was
 * still drawing, and "sent the portrait as a gift" after an image_edit that
 * sends nothing. Both now end with the check's note; real work does not.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './agent-claims-honest.gen'
import {
  linkClaimBacked,
  mediaClaimBacked,
  promptDated,
  sendClaimBacked,
} from './agent-claims-honest.logic'
import {
  honestyNote,
  LINK_HONESTY_NOTE,
  linkPromisedNotGiven,
  MEDIA_HONESTY_NOTE,
} from '../agent/claimed-but-not-done'
import { todayLine } from '../agent/agent-today'

describe('spec agent-claims-honest.t27', () => {
  it('a picture claimed is a picture made: called and answered with it', () => {
    expect(mediaClaimBacked(true, true)).toBe(true)
    expect(mediaClaimBacked(true, false)).toBe(false)
    expect(mediaClaimBacked(false, false)).toBe(false)
    expect(mediaClaimBacked(false, true)).toBe(false)
  })

  it('a send claimed is a send tool or a delivery card, never a picture alone', () => {
    expect(sendClaimBacked(true, false)).toBe(true)
    expect(sendClaimBacked(false, true)).toBe(true)
    expect(sendClaimBacked(false, false)).toBe(false)
  })

  it('a promised link is a link in the answer', () => {
    expect(linkClaimBacked(false, false)).toBe(true)
    expect(linkClaimBacked(true, true)).toBe(true)
    expect(linkClaimBacked(true, false)).toBe(false)
  })

  it('the prompt that answers people carries today', () => {
    expect(SPEC.PROMPT_CARRIES_TODAY).toBe(true)
    expect(promptDated(true)).toBe(true)
    expect(promptDated(false)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

// The event envelope and the tools' answer fields are Russian words; named
// once here so no test line carries Cyrillic outside a string.
const TYPE = 'тип' // cyrillic-ok: the event envelope's field
const NAME = 'имя' // cyrillic-ok: the event envelope's field
const VALUE = 'значение' // cyrillic-ok: the event envelope's field
const DONE = 'сделано' // cyrillic-ok: the tools' answer field
const WHY = 'причина' // cyrillic-ok: the tools' answer field
const TOOL = 'инструмент' // cyrillic-ok: the event kind
const RESULT = 'результат' // cyrillic-ok: the event kind
const call = (name: string, value: unknown) => [
  { [TYPE]: TOOL, [NAME]: name },
  { [TYPE]: RESULT, [NAME]: name, [VALUE]: value, ms: 10 },
]
const outcome = (done: boolean, extra: Record<string, unknown> = {}) => ({
  [DONE]: done,
  ...extra,
})
const URL =
  'https://vibee-render-production.up.railway.app/s3/assets/agent-edit-1.png'

describe('the Director, 2026-10-09, replayed (#3921)', () => {
  const poster =
    'Готово! Афиша игры Лила на завтра создана на основе вашего фото.\nСсылка:\nАфиша в стиле вашей игры.' // cyrillic-ok: the answer under test

  it('"Done! Link:" after an image_edit still drawing: both notes', () => {
    const still = call(
      'image_edit',
      outcome(false, { pending: true, [WHY]: 'картинка ещё рисуется' })
    ) // cyrillic-ok: the tool's answer
    const note = honestyNote(poster.replace('создана', 'создала'), still) // cyrillic-ok: the answer under test
    expect(note).toContain(LINK_HONESTY_NOTE)
    expect(linkPromisedNotGiven(poster)).toBe(true)
  })

  it('a finished picture with its link in the answer: no note', () => {
    const made = call('image_edit', outcome(true, { url: URL })) // cyrillic-ok: the tool's answer
    const answer = `Готово! Сделала афишу.\nСсылка: ${URL}` // cyrillic-ok: the answer under test
    expect(honestyNote(answer, made)).toBe('')
  })

  it('"I made the poster" after a failed call is not backed', () => {
    const failed = call(
      'image_generate',
      outcome(false, { [WHY]: 'провайдер не ответил' })
    ) // cyrillic-ok: the tool's answer
    expect(honestyNote('Я сделала афишу для вас.', failed)).toContain(
      MEDIA_HONESTY_NOTE
    ) // cyrillic-ok: the answer under test
    const done = call('image_generate', outcome(true, { url: URL })) // cyrillic-ok: the tool's answer
    expect(honestyNote(`Я сделала афишу для вас: ${URL}`, done)).toBe('') // cyrillic-ok: the answer under test
  })

  it('"sent her the portrait as a gift" after image_edit alone: a note', () => {
    const edit = call('image_edit', outcome(true, { url: URL })) // cyrillic-ok: the tool's answer
    const said = `Портрет готов: ${URL}\nОтправила портрет как подарок в Telegram.` // cyrillic-ok: the answer under test
    expect(honestyNote(said, edit)).toContain(MEDIA_HONESTY_NOTE)
  })

  it('a delivery card or a real send backs the send; a failed send does not', () => {
    const said = `Портрет готов: ${URL}\nОтправила портрет клиентке.` // cyrillic-ok: the answer under test
    const card = call('crm_deliver_photo', outcome(true, { url: URL })) // cyrillic-ok: the tool's answer
    expect(honestyNote(said, card)).toBe('')
    const sent = call('tg_send', { ok: true })
    expect(honestyNote(said, sent)).toBe('')
    const refused = call('tg_send', { ok: false, error: 'chat not found' })
    expect(honestyNote(said, refused)).toContain(MEDIA_HONESTY_NOTE)
  })

  it('"still drawing" alone, or an error alone, is no picture', () => {
    const said = 'Я сделала афишу для вас.' // cyrillic-ok: the answer under test
    expect(
      honestyNote(said, call('image_generate', { pending: true }))
    ).toContain(MEDIA_HONESTY_NOTE)
    expect(
      honestyNote(said, call('image_generate', { error: 'timeout' }))
    ).toContain(MEDIA_HONESTY_NOTE)
  })

  it('a call that failed and then succeeded backs the claim', () => {
    const twice = [
      ...call('image_generate', outcome(false)), // cyrillic-ok: the tool's answer
      ...call('image_generate', outcome(true, { url: URL })), // cyrillic-ok: the tool's answer
    ]
    expect(honestyNote(`Я сделала афишу для вас: ${URL}`, twice)).toBe('') // cyrillic-ok: the answer under test
  })

  it("today's line joins the turn's system prompt", async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const chat = readFileSync(join(__dirname, '..', 'agent', 'chat.ts'), 'utf8')
    expect(chat).toMatch(
      /officeTaskSection\(opts\) \+\s*todayLine\(opts\?\.surface, opts\?\.toolsOnly === true\)/
    )
  })

  it('a link after "Link:" on the next line is a link given', () => {
    expect(linkPromisedNotGiven(`Ссылка:\n${URL}`)).toBe(false) // cyrillic-ok: the answer under test
    expect(linkPromisedNotGiven('Ссылка на оплату придёт отдельно.')).toBe(
      false
    ) // cyrillic-ok: the answer under test
    expect(linkPromisedNotGiven('Link:')).toBe(true)
  })
})

describe('today in the prompt', () => {
  const at = new Date('2026-10-09T07:45:00Z')

  it('a person-facing turn is told today and tomorrow, by number', () => {
    const line = todayLine('miniapp', false, at)
    expect(line).toContain('2026-10-09')
    expect(line).toContain('2026-10-10')
    expect(line).toContain('пятница') // cyrillic-ok: tomorrow's weekday under test
  })

  it('the unattended sweep and an unknown surface carry no date', () => {
    expect(todayLine('bot', true, at)).toBe('')
    expect(todayLine('kanban', false, at)).toBe('')
    expect(todayLine(undefined, false, at)).toBe('')
  })
})
