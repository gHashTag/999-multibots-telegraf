import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const {
  render,
  rows,
  titleOf,
} = require('../../../scripts/gen-money-ratchets.cjs')

/**
 * The ratchet index is regenerated and compared, not trusted.
 *
 * docs/money-ratchets.md lists every money ratchet with the statement its
 * author wrote in the describe title. A hand-maintained list of that size
 * would be stale within a week -- this repository's record is full of
 * registries naming files that no longer exist. So the document is generated,
 * and this test rebuilds it in memory and requires the committed file to match
 * byte for byte.
 *
 * The consequence is deliberate: adding a money ratchet, renaming one, or
 * rewording a describe title makes this test fail until the index is
 * regenerated. That is the point. The failure message says the command.
 */

const INDEX = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'money-ratchets.md'
)

describe('the money ratchet index is current', () => {
  it('the generator sees a real population, not an empty one', () => {
    // Zero rows would make the comparison below pass against an empty file --
    // a guard that agrees with nothing because it measured nothing.
    const all = rows()
    expect(all.length).toBeGreaterThan(90)
    expect(all.filter((r: { title: string | null }) => !r.title)).toEqual([])
  })

  it('reads a title written as describe.each, not only describe', () => {
    // A population defined by ONE spelling of a thing is the defect this
    // repository keeps finding. Before this sample, the extractor reported a
    // real ratchet as having no statement, because its title is written
    // `describe.each(SCENES)('...')`.
    expect(titleOf(`describe('plain title', () => {})`)).toBe('plain title')
    expect(titleOf(`describe.each(X)('each title', f => {})`)).toBe(
      'each title'
    )
    expect(titleOf(`describe.skip('skipped title', () => {})`)).toBe(
      'skipped title'
    )
    expect(titleOf(`const x = 1`)).toBeNull()
  })

  it('the committed index matches what the repository says right now', () => {
    // Compared as ROWS, not as bytes. The first version compared the whole
    // file and could never hold: prettier owns docs/*.md and pads markdown
    // table columns, so the committed file differs from the generator's output
    // by whitespace alone. A guard that fights the formatter loses every time,
    // and its subject was never the whitespace -- it is which ratchet claims
    // what.
    const parse = (md: string) =>
      md
        .split('\n')
        .filter(l => l.trim().startsWith('| `'))
        .map(l => {
          const c = l.split('|').map(x => x.trim())
          return `${c[1].replace(/`/g, '')} :: ${c[2]}`
        })
        .sort()

    const committed = parse(fs.readFileSync(INDEX, 'utf8'))
    const current = parse(render())
    expect(
      committed.length,
      'the committed index parsed to nothing'
    ).toBeGreaterThan(90)
    expect(
      committed,
      'docs/money-ratchets.md is stale -- regenerate it:\n' +
        '    node scripts/gen-money-ratchets.cjs'
    ).toEqual(current)
  })
})
