/**
 * A MEASURING TOOL HAS TO BE MEASURED FIRST.
 *
 * The first version of `--verify` did its delay inside Node -- spawn the child,
 * attach the data listeners 400ms later -- and reported that a three-line script
 * loses all three lines when something reads it. That is false, and the false
 * verdict sent me to "fix" a pre-push gate that was never broken.
 *
 * Ground truth is a real shell pipe with a real slow reader. These tests pin the
 * tool against both ends of it, so the next person can trust a LOSES verdict
 * without re-deriving how Node writes to pipes.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TOOL = path.resolve(__dirname, 'exit-truncates.cjs')

describe('exit-truncates --verify', () => {
  let dir: string

  const script = (name: string, body: string) => {
    const p = path.join(dir, name)
    fs.writeFileSync(p, body)
    return p
  }

  /*
   * The tool exits 1 when it finds a loss -- that is the point of it -- so a
   * finding arrives here as a throw. The text is on stdout either way.
   */
  const verify = (target: string): string => {
    try {
      return execFileSync('node', [TOOL, '--verify', target], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (err: any) {
      return String(err.stdout)
    }
  }

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exit-trunc-'))
  })

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  /*
   * libuv writes synchronously while the pipe still has room, so a script that
   * prints three lines is safe however it exits. Calling that a loss is the
   * false positive this test exists to prevent.
   */
  it('does not accuse a small script that calls process.exit', () => {
    const p = script(
      'small.cjs',
      "console.log('a')\nconsole.log('b')\nconsole.log('c')\nprocess.exit(1)\n"
    )
    expect(verify(p)).toContain('loses nothing')
  })

  it('catches a script whose output outruns the pipe buffer', () => {
    const p = script(
      'big.cjs',
      "for (let i = 0; i < 4000; i++) console.log('line ' + i + ' padding padding')\nprocess.exit(1)\n"
    )
    const out = verify(p)
    expect(out).toContain('LOSES')
  })

  /*
   * The same script, the same volume, the one-word fix. If this ever reports a
   * loss, the tool is measuring something other than the exit.
   */
  it('clears the same script once it sets exitCode instead', () => {
    const p = script(
      'bigok.cjs',
      "for (let i = 0; i < 4000; i++) console.log('line ' + i + ' padding padding')\nprocess.exitCode = 1\n"
    )
    expect(verify(p)).toContain('loses nothing')
  })
})
