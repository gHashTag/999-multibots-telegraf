/**
 * A FILE THAT IS NOT IN `assets` DOES NOT EXIST FOR THE PERSON WHO PAID.
 *
 * The mini app is where the owner sees an agent's work -- that is the whole
 * product idea: an outside agent connects, makes something, and a human looks
 * at it and tunes the campaign. The app reads the `assets` table. S3 is
 * storage, not a shop window.
 *
 * image_edit shipped without the insert. The picture reached the bucket, the
 * caller received a URL in a chat message, and my_assets still reported
 * 2026-08-24 as the newest file -- a week stale, measured through the
 * production MCP on 2026-08-31. Nothing was broken in a way any test could see,
 * because the tool answered `done: true` and the URL worked.
 *
 * So the rule is checked at the level it lives on: every tool that uploads
 * bytes to /upload must also register the result. The list of such tools is
 * DERIVED FROM THE SOURCE rather than remembered, because a list you have to
 * remember to extend is a list that goes stale on the next tool.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.join(__dirname, 'src/agent/tools.ts'), 'utf8')

/**
 * Split the file into tool blocks: each starts at `name: '<tool>'` and runs to
 * the next one. Crude on purpose -- a parser would be another thing to keep
 * correct, and the shape of this file has been stable for months.
 */
function toolBlocks(): { name: string; body: string }[] {
  const marks = [...SRC.matchAll(/^\s{4}name: '([a-z_]+)',$/gm)]
  return marks.map((m, i) => ({
    name: m[1],
    body: SRC.slice(m.index!, marks[i + 1]?.index ?? SRC.length),
  }))
}

const BLOCKS = toolBlocks()

/**
 * SHARED DELIVERY HELPERS, AND WHY THE SCAN HAD TO LEARN ABOUT THEM.
 *
 * The first version of this file looked for `/upload` inside a tool block, so a
 * tool whose upload lives in a helper was invisible to it — and the moment two
 * tools deliver the same artefact (a blocking path and a recovery path), a
 * helper is the right shape and copying sixty lines is the wrong one. A gate
 * that only sees the inlined version quietly stops covering the code that
 * replaces it.
 *
 * So a helper counts as delivery only if IT does both halves, and that is
 * asserted below rather than assumed.
 */
const DELIVERY_HELPERS = ['deliverToGallery', 'settleFaceJob']

/** The source of everything outside the tool blocks: where the helpers live. */
const PREAMBLE = SRC.slice(0, BLOCKS[0]?.body ? SRC.indexOf(BLOCKS[0].body) : 0)

function helperBody(name: string): string {
  const at = PREAMBLE.indexOf(`async function ${name}(`)
  if (at < 0) return ''
  const next = PREAMBLE.slice(at + 1).search(/^(?:async )?function /m)
  return next < 0 ? PREAMBLE.slice(at) : PREAMBLE.slice(at, at + 1 + next)
}

/**
 * Does this source register a file — itself, or through a helper that does?
 *
 * Depth-limited rather than unbounded: two hops is the shape that exists
 * (tool -> settleFaceJob -> deliverToGallery), and a chain longer than that
 * would be worth objecting to on its own.
 */
function registers(body: string, depth = 2): boolean {
  if (/INSERT INTO assets/.test(body)) return true
  if (depth <= 0) return false
  return DELIVERY_HELPERS.some(
    h => new RegExp(`${h}\\(`).test(body) && registers(helperBody(h), depth - 1)
  )
}

/** Tools that push bytes into our S3 and therefore produce a file. */
const PRODUCERS = BLOCKS.filter(
  b =>
    /\/upload`/.test(b.body) ||
    DELIVERY_HELPERS.some(h => new RegExp(`${h}\\(`).test(b.body))
)

describe('каждый инструмент, создающий файл, кладёт его в витрину', () => {
  it('разбор нашёл и инструменты, и производителей файлов', () => {
    // A zero denominator would pass every assertion below. Both numbers are
    // asserted, because a regex that matches nothing is the failure mode this
    // whole file exists to prevent.
    expect(BLOCKS.length).toBeGreaterThan(20)
    expect(PRODUCERS.length).toBeGreaterThanOrEqual(2)
  })

  it('общий помощник доставки сам делает обе половины', () => {
    // Without this, delegating to a helper would be a way to PASS the rule
    // instead of a way to follow it: the check below accepts the call, so the
    // call had better be worth accepting.
    for (const h of DELIVERY_HELPERS) {
      const body = helperBody(h)
      expect(body.length, `помощник ${h} не найден вне блоков`).toBeGreaterThan(0)
      expect(registers(body), `${h} не доводит файл до assets`).toBe(true)
    }
    // The one at the bottom of the chain must do the S3 half itself; otherwise
    // "registered" could be true for a row pointing at a provider link that
    // dies within the hour.
    expect(helperBody('deliverToGallery')).toMatch(/\/upload`/)
    expect(helperBody('deliverToGallery')).toMatch(/INSERT INTO assets/)
  })

  it('каждый производитель пишет строку в assets', () => {
    const unregistered = PRODUCERS.filter(b => !registers(b.body)).map(
      b => b.name
    )
    expect(unregistered, 'файл попадёт в S3 и не попадёт в мини-апп').toEqual(
      []
    )
  })

  it('говорящее лицо доставляет обоими путями: и ожиданием, и восстановлением', () => {
    // Two tools, one artefact. The recovery path is the one that matters when a
    // 200-credit job outlives the call that started it, and a delivery that
    // only the happy path performs would leave that clip in the bucket alone.
    for (const name of ['face_speak', 'face_speak_status']) {
      const b = BLOCKS.find(x => x.name === name)
      expect(b, `инструмент ${name} не найден`).toBeTruthy()
      expect(registers(b!.body), `${name} не регистрирует файл`).toBe(true)
    }
  })

  it('image_edit регистрирует именно свой загруженный файл', () => {
    const b = BLOCKS.find(x => x.name === 'image_edit')
    expect(b, 'инструмент image_edit не найден').toBeTruthy()
    // The row must carry the URL of OUR copy, not the provider's temporary
    // link: a tempfile URL dies within the hour and the gallery would show a
    // broken picture tomorrow.
    expect(b!.body).toMatch(/INSERT INTO assets[\s\S]{0,400}upData\.directUrl/)
  })

  it('сбой регистрации не отменяет успешную генерацию', () => {
    // The picture exists and was paid for; failing the whole call because the
    // bookkeeping failed would take money and give nothing. The gap must be
    // REPORTED instead -- silence here is what made the original defect
    // invisible.
    const b = BLOCKS.find(x => x.name === 'image_edit')!
    expect(b.body).toMatch(/inGallery/)
    expect(b.body).toMatch(/galleryError/)
  })
})
