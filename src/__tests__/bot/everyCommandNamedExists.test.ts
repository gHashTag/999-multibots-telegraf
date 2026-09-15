import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A MESSAGE THAT TELLS THE OWNER WHAT TO TYPE MUST NAME SOMETHING THAT EXISTS.
 *
 * The sweep refused the warming preset by telling the owner to use a
 * command that is registered nowhere. He types exactly what he was told
 * what the bot told him to type and gets silence. That reads as a broken bot,
 * and it costs more than the refusal it was trying to explain.
 *
 * SCOPE, NARROW ON PURPOSE. Only crmSweepScope.ts, the file whose whole job is
 * telling the owner what to type: its SYNTAX line and its refusals. A
 * repository-wide scan for "/word" inside strings drowns in import paths and
 * URLs, and a guard that cries wolf is switched off -- which is how the
 * registry in callbackNumberParseRegistry went unread for days.
 */
describe('a command named in a message is a command that exists', () => {
  const root = path.join(__dirname, '..', '..')
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

  /** Every `bot.command('x'` in the navigation layer. */
  const registered = new Set(
    [
      ...read('navigation/registerCommands.ts').matchAll(
        /bot\.command\(\s*'([a-z_]+)'/g
      ),
    ].map(m => m[1])
  )

  it('finds the commands at all (a broken matcher fails, not passes)', () => {
    // Positive control: without this, an empty set would make everything below
    // pass by vacuum.
    expect(registered.size).toBeGreaterThan(10)
    expect(registered.has('sweep')).toBe(true)
  })

  it('every command the sweep messages name is registered', () => {
    /*
     * COMMENTS ARE NOT MESSAGES.
     *
     * Stripped before the scan, and not for tidiness: the comment explaining
     * this very defect quotes the dead `/batch` line, and the guard read its
     * own explanation as a message to the owner. A guard that fires on the
     * note about the bug it fixed teaches everybody to ignore it.
     */
    const src = read('services/crmSweepScope.ts')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    /*
     * Built from a string, not written as a regex literal: the Cyrillic guard
     * cannot see inside a literal and blocks the commit. This repository has
     * paid for that twice, and once was in the skill that warns about it.
     */
    const cyrillic = new RegExp('[\\u0430-\\u044f\\u0451]', 'i')
    /*
     * ALL THREE QUOTE STYLES, NOT THE ONE IN USE TODAY.
     *
     * The first version read single quotes only. Measured with a mutation:
     * move the very same message into backticks -- which prettier does the
     * moment an interpolation appears in it -- and the guard went blind while
     * staying green. A guard that a reformat can switch off is form 22 in the
     * blind-guards skill, and it is worth the three-branch regex here.
     */
    const strings = [
      ...src.matchAll(/'([^'\\\n]{4,400})'/g),
      ...src.matchAll(/"([^"\\\n]{4,400})"/g),
      ...src.matchAll(/`([^`\\]{4,400})`/g),
    ].map(m => m[1])
    const named = new Set<string>()
    for (const s of strings) {
      if (!cyrillic.test(s)) continue
      for (const m of s.matchAll(/(?<![\w/])\/([a-z_]{2,20})\b/g))
        named.add(m[1])
    }
    expect(
      named.size,
      'no command is named in any message any more'
    ).toBeGreaterThan(0)
    const missing = [...named].filter(c => !registered.has(c))
    expect(
      missing,
      'the owner is told to type a command nobody registered'
    ).toEqual([])
  })
})
