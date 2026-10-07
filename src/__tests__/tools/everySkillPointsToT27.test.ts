/**
 * EVERY SKILL SAYS WE WRITE IN .t27.
 *
 * Owner, 07.10.2026: "write in every skill that we write everything in
 * .t27". The rule itself lives in one place (t27-spec-first); every other
 * skill carries a short pointer section to it, so an agent that loads any
 * skill meets the rule. A skill added without the pointer is caught here,
 * not by the next owner's message.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SKILLS = resolve(__dirname, '../../../.claude/skills')
const HEADING = '## Пишем на .t27' // cyrillic-ok: the section's own heading
const HOME = 't27-spec-first'

/** The file a skill directory is read from: SKILL.md, else its README.md. */
const skillFile = (dir: string): string | null => {
  for (const name of ['SKILL.md', 'README.md']) {
    const f = join(SKILLS, dir, name)
    if (existsSync(f)) return f
  }
  return null
}

const dirs = readdirSync(SKILLS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

describe('every skill points to the .t27 rule', () => {
  it('finds the skills at all (a wrong path is not a pass)', () => {
    expect(dirs.length).toBeGreaterThan(50)
    expect(dirs).toContain(HOME)
  })

  it("each one carries the pointer section and names the rule's home", () => {
    const missing = dirs
      .filter(d => d !== HOME)
      .map(d => [d, skillFile(d)] as const)
      .filter(([, f]) => f !== null)
      .filter(([, f]) => {
        const s = readFileSync(f!, 'utf8')
        const at = s.indexOf(HEADING)
        return at < 0 || !s.slice(at, at + 800).includes(HOME)
      })
      .map(([d]) => d)
    expect(missing, missing.join(', ')).toEqual([])
  })

  it("the rule's home records the owner's words of 07.10.2026", () => {
    const s = readFileSync(skillFile(HOME)!, 'utf8')
    expect(s).toContain('07.10.2026')
    expect(s).toContain('все пишем на .t27') // cyrillic-ok: the owner's words
  })
})
