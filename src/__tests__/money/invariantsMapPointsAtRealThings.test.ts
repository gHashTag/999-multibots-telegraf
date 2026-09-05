import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The money map is a set of CLAIMS, so it is checked like one.
 *
 * docs/money-invariants.md collects what twenty iterations established about
 * money: which invariants hold, where each is enforced, and which command
 * measures it. A document like that is worth exactly as much as its pointers,
 * and this repository has a long record of pointers outliving their subjects --
 * report lines naming symbols that live only in the report, registries listing
 * files that no longer exist, seventeen references to seven sections that had
 * been renumbered away.
 *
 * So every row of the map must name something that exists RIGHT NOW:
 *
 *   - the test file it points at is present,
 *   - the describe title it quotes is really in that file,
 *   - the `tri` verb it recommends is really in the dispatcher.
 *
 * A row that loses its subject reddens this test instead of quietly becoming
 * false. That is the whole point: the map cannot rot silently.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const MAP = path.join(REPO, 'docs', 'money-invariants.md')

const mapText = () => fs.readFileSync(MAP, 'utf8')

/** Rows of the invariant table: `file.test.ts` plus the quoted describe title. */
function invariantRows(): Array<{ file: string; title: string }> {
  const rows: Array<{ file: string; title: string }> = []
  for (const line of mapText().split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim())
    // | # | invariant | `file.test.ts` | `describe title` |
    if (cells.length < 6) continue
    const file = cells[3].replace(/`/g, '')
    const title = cells[4].replace(/`/g, '')
    if (!file.endsWith('.test.ts')) continue
    rows.push({ file, title })
  }
  return rows
}

/** Commands the map recommends, taken from the measurement table. */
function triVerbs(): string[] {
  const out: string[] = []
  for (const m of mapText().matchAll(/`tri ([a-z-]+)`/g)) out.push(m[1])
  return [...new Set(out)]
}

describe('the money invariants map points at real things', () => {
  it('the map is parsed, not merely present', () => {
    // Zero rows would make every assertion below vacuously true -- the exact
    // shape of a guard that passes because its population collapsed.
    expect(invariantRows().length).toBeGreaterThan(8)
    expect(triVerbs().length).toBeGreaterThan(3)
  })

  it('every named test file exists', () => {
    const missing = invariantRows()
      .map(r => r.file)
      .filter(f => !fs.existsSync(path.join(__dirname, f)))
    expect(missing).toEqual([])
  })

  it('every quoted describe title is really in its file', () => {
    const wrong: string[] = []
    for (const { file, title } of invariantRows()) {
      const p = path.join(__dirname, file)
      // No silent skip. A missing file is caught by the assertion above, but
      // skipping here would also hide it if that one were ever weakened --
      // and a guard whose population quietly shrinks is the defect this
      // repository keeps finding.
      if (!fs.existsSync(p)) {
        wrong.push(`${file}: файла нет`)
        continue
      }
      if (!fs.readFileSync(p, 'utf8').includes(title)) {
        wrong.push(`${file}: "${title}"`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('every recommended tri verb is in the dispatcher', () => {
    const tri = fs.readFileSync(path.join(REPO, 'tri'), 'utf8')
    const missing = triVerbs().filter(
      v => !new RegExp(`^\\s*${v}\\|`, 'm').test(tri)
    )
    expect(missing).toEqual([])
  })
})
