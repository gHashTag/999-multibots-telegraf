/**
 * Spec agent-claims-honest.t27 (gHashTag/t27#8082), every test block run
 * against the compiled logic the host calls, then the 2026-10-09 turns of
 * the Director replayed (#3921): "Done! Link:" after an image_edit that was
 * still drawing, and "sent the portrait as a gift" after an image_edit that
 * sends nothing. Both now end with the check's note; real work does not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './agent-claims-honest.gen'
import {
  fileOwed,
  lateFilePosted,
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
import { assetUrlsIn, madeFileUrl } from '../agent/asset-links'
import { onLateOutcome, postLateFile } from '../agent/late-file'

const BASE = 'https://bucket-production-8259.up.railway.app/vibee-assets'
const FILE = `${BASE}/assets/1791547101324-4b3edafccd7463ef-agent-edit-1.png`
afterEach(() => vi.unstubAllEnvs())

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

  it('every file a tool made reaches the person, once', () => {
    expect(SPEC.FILES_APPENDED_BY_HOST).toBe(true)
    expect(fileOwed(true, false)).toBe(true)
    expect(fileOwed(true, true)).toBe(false)
    expect(fileOwed(false, false)).toBe(false)
    // FILE_MAKERS: the tools that make a file; a lister is not one.
    const makers = SPEC.FILE_MAKERS.split(',')
    expect(makers).toContain('image_edit')
    expect(makers).not.toContain('crm_lead_media')
    vi.stubEnv('S3_PUBLIC_URL', BASE)
    expect(madeFileUrl({ done: true, url: FILE })).toBe(FILE)
    expect(madeFileUrl({ done: false, url: FILE })).toBeNull()
    expect(madeFileUrl({ сделано: false, url: FILE })).toBeNull() // cyrillic-ok: the tools' answer field
    expect(madeFileUrl({ files: [FILE] })).toBeNull()
    expect(madeFileUrl({ url: 'https://example.com/x.png' })).toBeNull()
    // OUR_LINK_ENDS_AT_EXTENSION: what is glued after the file is prose.
    expect(SPEC.OUR_LINK_ENDS_AT_EXTENSION).toBe(true)
    for (const glued of [`**${FILE}**`, `${FILE}»`, `${FILE}—это`, `${FILE}…`])
      expect(assetUrlsIn(glued)).toEqual([FILE])
  })

  it('a late picture goes into its own thread and nowhere else', async () => {
    expect(lateFilePosted(true, true, false)).toBe(true)
    expect(lateFilePosted(false, true, false)).toBe(false)
    expect(lateFilePosted(true, false, false)).toBe(false)
    expect(lateFilePosted(true, true, true)).toBe(false)
    const writes: unknown[][] = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO agent_messages/.test(sql)) writes.push(params)
        return { rows: [] }
      },
    }
    const ctx = { telegramId: '900000002', pool, surface: 'miniapp' }
    expect(await postLateFile({ ...ctx } as never, FILE)).toBe(false)
    expect(
      await postLateFile({ ...ctx, thread: 'client:900000003' } as never, FILE)
    ).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0][1]).toBe('assistant')
    expect(String(writes[0][2])).toContain(FILE)
    expect(writes[0][4]).toBe('client:900000003')
    // The watch's verdict: a picture that came is posted, not refunded; an
    // ephemeral turn posts nothing; one that never came is refunded.
    const refund = vi.fn(async () => undefined)
    const kept = { ...ctx, thread: 'client:900000003' }
    await onLateOutcome(kept as never, { state: 'ready', url: FILE }, refund)
    expect(writes).toHaveLength(2)
    expect(refund).not.toHaveBeenCalled()
    await onLateOutcome(
      { ...kept, ephemeral: true } as never,
      { state: 'ready', url: FILE },
      refund
    )
    expect(writes).toHaveLength(2)
    await onLateOutcome(kept as never, { state: 'failed' }, refund)
    expect(refund).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(2)
    // image_edit hands its late verdict to exactly this function (source
    // level: the paid late path needs the provider to exercise end to end).
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const tools = readFileSync(
      join(__dirname, '..', 'agent', 'tools.ts'),
      'utf8'
    )
    const at = tools.indexOf("name: 'image_edit'")
    const end = tools.indexOf("name: 'image_generate'", at)
    expect(at).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(at)
    expect(tools.slice(at, end)).toMatch(
      /\.then\(out =>\s*onLateOutcome\(ctx, out, async \(\) => \{/
    )
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
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
