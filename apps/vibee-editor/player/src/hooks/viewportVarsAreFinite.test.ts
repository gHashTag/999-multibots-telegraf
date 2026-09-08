import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A MISSING VIEWPORT HEIGHT MUST NOT POISON THE CSS.
 *
 * useTelegramWebApp wrote `--app-vh-stable: ${wa.viewportStableHeight}px`
 * unconditionally. When the client has no number yet (the dev mock; a desktop
 * client before its first viewport event) the variable became the literal
 * `undefinedpx`, and every calc() built on it -- page heights, the script
 * sheet's max-height, the chat's container -- silently turned invalid.
 * Measured 08.09.2026: the script page collapsed to 427px and its sheet grew
 * to 931px, taller than the screen. The CSS default (100dvh) must survive
 * until a real number arrives.
 */
describe('viewport CSS variables are only written with finite numbers', () => {
  const src = fs.readFileSync(
    path.join(__dirname, 'useTelegramWebApp.ts'),
    'utf8'
  )

  it('both viewport variables are guarded by Number.isFinite', () => {
    for (const [v, field] of [
      ['--app-vh', 'viewportHeight'],
      ['--app-vh-stable', 'viewportStableHeight'],
    ] as const) {
      const re = new RegExp(
        `if \\(Number\\.isFinite\\(wa\\.${field}\\)\\)\\s*setVar\\('${v}', \`\\$\\{wa\\.${field}\\}px\`\\)`
      )
      expect(src, `${v} must be guarded`).toMatch(re)
    }
    // Every write of these two variables is guarded: as many guards as writes.
    const writes = (src.match(/setVar\('--app-vh(?:-stable)?',/g) ?? []).length
    const guards = (
      src.match(/Number\.isFinite\(wa\.viewport(?:Stable)?Height\)/g) ?? []
    ).length
    expect(writes).toBe(2)
    expect(guards).toBe(writes)
  })
})
