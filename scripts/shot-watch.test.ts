/**
 * `tri shot watch` says what CHANGED on the phone since the last run.
 *
 * The parser reads the exact lines `tri shot all` prints (a stand's problem
 * lines come before its verdict), and the comparison decides "worse" -- the
 * one answer a scheduled run acts on. The CLI is driven with --from, so no
 * browser or dev server is started here.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compareShots, parseShots } from '../bin/helpers/shot-watch.mjs'

const WATCH = resolve(__dirname, '../bin/helpers/shot-watch.mjs')

const GREEN_ALL = [
  '== shot green -- story-palette at 390px (ru)',
  '== shot green -- story-palette at 390px (en)',
  '== shot green -- kanban-card at 320px (ru)',
].join('\n')

const ONE_RED = [
  '== shot green -- story-palette at 390px (ru)',
  '       small   button "Send" 32x32',
  '       cut     .card__title "A very long na…"',
  '== shot RED -- story-palette at 390px (en)',
  '== shot NOT MEASURED -- kanban-card 320 ru',
].join('\n')

describe('parseShots', () => {
  it('gives each stand its own verdict and the problems printed before it', () => {
    const { runs, down } = parseShots(ONE_RED)
    expect(down).toBe(false)
    expect(runs['story-palette 390 ru']).toEqual({
      verdict: 'green',
      issues: [],
    })
    expect(runs['story-palette 390 en'].verdict).toBe('RED')
    expect(runs['story-palette 390 en'].issues).toEqual([
      'cut .card__title "A very long na…"',
      'small button "Send" 32x32',
    ])
    // A child that printed no verdict is a stand, not a missing line.
    expect(runs['kanban-card 320 ru']).toEqual({
      verdict: 'NOT MEASURED',
      issues: [],
    })
  })

  it('notices when the whole run could not start', () => {
    const { runs, down } = parseShots(
      '== shot NOT MEASURED -- all: dev server did not answer'
    )
    expect(down).toBe(true)
    expect(runs).toEqual({})
  })
})

describe('compareShots', () => {
  const g = { verdict: 'green', issues: [] }
  const red = (...issues: string[]) => ({ verdict: 'RED', issues })

  it('calls green -> RED worse and names the new problem', () => {
    const out = compareShots({ a: g }, { a: red('small x') })
    expect(out.worse).toEqual(['a: green -> RED (1) · small x'])
    expect(out.better).toEqual([])
  })

  it('calls more problems on a red stand worse, fewer better', () => {
    expect(compareShots({ a: red('x') }, { a: red('x', 'y') }).worse).toEqual(
      ['a: RED (1) -> RED (2) · y']
    )
    expect(compareShots({ a: red('x', 'y') }, { a: red('x') }).better).toEqual(
      ['a: RED (2) -> RED (1)']
    )
  })

  it('counts NOT MEASURED as worse than red: a silent stand hides everything', () => {
    const out = compareShots(
      { a: red('x') },
      { a: { verdict: 'NOT MEASURED', issues: [] } }
    )
    expect(out.worse).toHaveLength(1)
  })

  it('calls a vanished stand worse and a new green one better', () => {
    const out = compareShots({ gone: g }, { fresh: g })
    expect(out.worse).toEqual(['gone: vanished (was green)'])
    expect(out.better).toEqual(['fresh: new, green'])
  })

  it('counts unchanged stands without listing them', () => {
    expect(compareShots({ a: g, b: g }, { a: g, b: g })).toEqual({
      worse: [],
      better: [],
      same: 2,
    })
  })
})

// Each step starts node; on a loaded machine that alone outlives 5 s.
describe('tri shot watch (CLI, --from)', () => {
  const run = (dir: string, text: string) => {
    const from = join(dir, 'out.txt')
    writeFileSync(from, text)
    return spawnSync(
      'node',
      [WATCH, '--from', from, '--state', join(dir, 'state.json')],
      { encoding: 'utf8' }
    )
  }

  it('saves the first run, then exits 1 only when something got worse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-watch-'))
    try {
      const first = run(dir, GREEN_ALL)
      expect(first.status).toBe(0)
      expect(first.stdout).toContain('== shot watch first -- 3 green')

      const steady = run(dir, GREEN_ALL)
      expect(steady.status).toBe(0)
      expect(steady.stdout).toContain('== shot watch steady')

      const worse = run(dir, ONE_RED)
      expect(worse.status).toBe(1)
      expect(worse.stdout).toContain('worse   story-palette 390 en: green -> RED (2)')
      expect(worse.stdout).toContain('worse   kanban-card 320 ru: green -> NOT MEASURED')

      const back = run(dir, GREEN_ALL)
      expect(back.status).toBe(0)
      expect(back.stdout).toContain('better  story-palette 390 en')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('keeps the last state when nothing could be measured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-watch-'))
    try {
      run(dir, GREEN_ALL)
      const saved = readFileSync(join(dir, 'state.json'), 'utf8')
      const down = run(dir, '== shot NOT MEASURED -- all: vite died')
      expect(down.status).toBe(2)
      expect(readFileSync(join(dir, 'state.json'), 'utf8')).toBe(saved)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
