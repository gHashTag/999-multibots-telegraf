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

/** Tools that push bytes into our S3 and therefore produce a file. */
const PRODUCERS = BLOCKS.filter(b => /\/upload`/.test(b.body))

describe('каждый инструмент, создающий файл, кладёт его в витрину', () => {
  it('разбор нашёл и инструменты, и производителей файлов', () => {
    // A zero denominator would pass every assertion below. Both numbers are
    // asserted, because a regex that matches nothing is the failure mode this
    // whole file exists to prevent.
    expect(BLOCKS.length).toBeGreaterThan(20)
    expect(PRODUCERS.length).toBeGreaterThanOrEqual(2)
  })

  it('каждый производитель пишет строку в assets', () => {
    const unregistered = PRODUCERS.filter(
      b => !/INSERT INTO assets/.test(b.body)
    ).map(b => b.name)
    expect(unregistered, 'файл попадёт в S3 и не попадёт в мини-апп').toEqual(
      []
    )
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
