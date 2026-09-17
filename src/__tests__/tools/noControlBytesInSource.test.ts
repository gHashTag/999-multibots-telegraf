import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A SOURCE FILE WITH A ZERO BYTE IS INVISIBLE TO EVERY SHELL CHECK.
 *
 * Found 2026-09-16 in apps/vibee-editor/render/src/agent/tools.ts: one real
 * 0x00, written as a byte where the escape was meant. It was a hash domain
 * separator, so it worked, and nothing about the service behaved oddly.
 *
 * What it broke is the checking, not the running. grep declares a file with a
 * zero byte BINARY and prints one line about it instead of the matches, so
 * all 2888 lines of the agent's tool registry -- the file that decides which
 * tools the model is offered -- returned nothing:
 *
 *   $ grep -rn "renderFingerprint" apps/vibee-editor/render/src/agent/
 *   (nothing)
 *
 * A guard that silently searches zero lines reports "clean". That is the
 * worst failure a guard has: it does not break, it agrees with you.
 *
 * The escape is not a workaround. VALUE is identical -- the same single byte
 * reaches the hash either way, proven before the change -- so nothing that
 * was cached under the old fingerprint is invalidated. Only the FILE stops
 * being binary.
 */
describe('no source file carries a zero byte', () => {
  const ROOTS = ['src', 'apps/vibee-editor/render/src']
  const SKIP = new Set(['node_modules', 'dist', 'build', '.git'])

  const sources = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return []
    const out: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out.push(...sources(p))
      else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name)) out.push(p)
    }
    return out
  }

  it('because grep skips such a file and says nothing', () => {
    const files = ROOTS.flatMap(sources)
    // A count, so a broken walk cannot pass as a clean tree.
    expect(files.length).toBeGreaterThan(500)

    const guilty: string[] = []
    for (const f of files) {
      if (fs.readFileSync(f).includes(0)) guilty.push(f)
    }
    expect(
      guilty,
      `zero byte in source -- write it as the escape ${JSON.stringify('\u0000')} instead:\n  ` +
        guilty.join('\n  ')
    ).toEqual([])
  })
})
