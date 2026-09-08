import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/*
 * THE GUARD HAS TO LOOK WHERE THE LEAK WAS.
 *
 * Two credential leaks on one machine on one day, and NEITHER was in the
 * repository: a session log, and two `railway variables` dumps in a scratchpad.
 * Every guard this repo owns reads the repo or the diff, so all of them were
 * blind to both.
 *
 * WHY THIS IS NOT A PRE-PUSH HOOK, recorded because the obvious move was tried
 * and measured: wired to pre-push it produced 44 matches on a clean tree, 16
 * after tightening the dump heuristic, and every one of the 16 is a placeholder
 * in a doc, an .example file or a deploy script. Zero real. A gate that stops a
 * push sixteen times for nothing is removed within a day, and a scanner people
 * have removed catches nothing.
 */
const ROOT = path.resolve(__dirname, '../../..')
const tri = fs.readFileSync(path.join(ROOT, 'tri'), 'utf8')
const code = tri
  .replace(/^\s*#.*$/gm, '')
  .split('\n')
  .join('\n')

describe('tri secrets scans where nothing else looks', () => {
  it('the subcommand exists and is dispatched', () => {
    expect(code).toMatch(/cmd_secrets\(\)/)
    // The Russian half is not spelled here: a Cyrillic literal trips the
    // repo's own gate, and a suppression marker does not survive prettier,
    // which moves a trailing comment onto its own line.
    expect(code).toMatch(/secrets-on-disk\|[^)]+\)\s*cmd_secrets/)
  })

  it('NO alias is claimed twice: the dispatcher takes the first and says nothing', () => {
    /*
     * I HIT THIS MYSELF, ADDING THE COMMAND ABOVE.
     *
     * `секреты` was already an alias of secrets-audit further down the same
     * `case`, and my arm sat earlier -- so it stole the alias silently. A case
     * statement takes the first match; there is no warning, no error, and the
     * shadowed command simply stops answering to that name.
     *
     * Censusing the rest found four more, one of them fatal: cmd_events had
     * BOTH its aliases -- the English and the Russian one -- taken nineteen
     * lines earlier, so the command was unreachable by any name at all.
     * Three others had lost their
     * Russian alias only.
     *
     * All five are fixed. This test is what keeps the sixth from arriving.
     */
    const tail = code.slice(code.lastIndexOf('case "$action" in'))
    // \p{L} rather than a Cyrillic range: the aliases are Russian, and
    // writing the letters here would trip the repo's own no-cyrillic gate.
    const arms = [...tail.matchAll(/^ {2}([\p{L}0-9|_-]+)\)/gmu)].map(m => m[1])
    expect(arms.length, 'the dispatcher was not found').toBeGreaterThan(50)
    const seen = new Map<string, string>()
    const stolen: string[] = []
    for (const arm of arms)
      for (const alias of arm.split('|')) {
        if (seen.has(alias))
          stolen.push(`${alias} (${seen.get(alias)} then ${arm})`)
        else seen.set(alias, arm)
      }
    expect(stolen).toEqual([])
  })

  it('its default roots are the temp dirs, and NOT the repository', () => {
    // Pointing it at the repo is the version that gets switched off.
    const fn = sliceFrom(code, 'cmd_secrets()')
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/TMPDIR/)
    expect(body).toMatch(/\/tmp/)
    expect(
      body,
      'defaulting to the repo makes it a false-alarm machine'
    ).not.toMatch(/roots=\(\s*\.\s*\)|roots\+=\("\$ROOT"\)/)
  })

  it('it refuses to guess when there is nothing to scan', () => {
    const fn = sliceFrom(code, 'cmd_secrets()')
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/return 2/)
  })

  it('it is NOT wired into a git hook', () => {
    // Deliberate, measured, and pinned so it does not get "helpfully" added.
    const hooks = fs.readFileSync(path.join(ROOT, 'lefthook.yml'), 'utf8')
    expect(hooks).not.toMatch(/scan-secrets-on-disk/)
  })
})
