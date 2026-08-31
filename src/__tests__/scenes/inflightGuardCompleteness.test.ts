import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Every paid/generation scene uses a synchronous in-flight guard
// (`if (ctx.session.<X>InProgress) return; ctx.session.<X>InProgress = true`)
// to block a double-dispatch while a generation runs. If the flag is only
// cleared on the success path, an error leaves it stuck true -> the user is
// permanently blocked from that feature until the session resets. So every
// `<X>InProgress = true` MUST be released on ALL paths: in a `finally` or in a
// scene `.leave()` handler. videoWizardsInflightGuard covers 2 wizards; this
// pins the whole class. Guard source-level (repo style, like mountOrder).
const scenesDir = path.join(__dirname, '..', '..', 'scenes')

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

type Flag = { file: string; flag: string; src: string }
const flags: Flag[] = []
for (const f of walk(scenesDir)) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/ctx\.session\.(\w+InProgress)\s*=\s*true/g)) {
    const flag = m[1]
    if (!flags.some(x => x.file === f && x.flag === flag))
      flags.push({ file: f.slice(scenesDir.length + 1), flag, src })
  }
}

const releasedSafely = (src: string, flag: string): boolean => {
  const f = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // reset inside a finally block (generous window for large finally bodies)
  const inFinally = new RegExp(
    `finally\\s*\\{[\\s\\S]{0,1200}?ctx\\.session\\.${f}\\s*=\\s*false`
  ).test(src)
  // reset inside a scene .leave() handler
  const inLeave = new RegExp(
    `\\.leave\\(\\s*async[\\s\\S]{0,600}?ctx\\.session\\.${f}\\s*=\\s*false`
  ).test(src)
  return inFinally || inLeave
}

describe('every in-flight generation guard is released on all paths (no stuck flag)', () => {
  it('finds the in-flight guards (a broken matcher fails, not passes)', () => {
    expect(flags.length).toBeGreaterThan(15)
  })

  it('each <X>InProgress = true is released in a finally or a .leave handler', () => {
    const stuck = flags
      .filter(({ src, flag }) => !releasedSafely(src, flag))
      .map(({ file, flag }) => `${file}: ${flag}`)
    expect(
      stuck,
      'these in-flight flags are set true but not released on all paths ' +
        '(finally or .leave) -> a generation error leaves the user permanently ' +
        'blocked from the feature. Release the flag in a finally or scene .leave().'
    ).toEqual([])
  })
})
