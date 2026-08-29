/**
 * A Telegraf scene that is imported into the stage builder but left out of the
 * scenesToRegister array is a dead button: ctx.scene.enter('<id>') on it finds
 * no scene and the flow breaks. The compiler cannot see it — the import is
 * "used" as far as eslint is concerned the moment the file references the type,
 * and the array is a plain list nobody diffs against the imports.
 *
 * This is the same "imported is not served" gap the Inngest registration gate
 * closes (see src/__tests__/inngest/registration.test.ts). A scene counts as
 * registered only if its imported name is actually referenced inside the
 * scenesToRegister array, not merely because an import line for it exists.
 *
 * Scope: this checks scenes IMPORTED INTO the stage builder. Fully-orphaned
 * scenes that are never imported there (e.g. the gutted level-quest step scenes,
 * whose entry point setupLevelHandlers is itself unregistered) are out of view
 * of an import-based check, exactly as with the Inngest gate — a known limit,
 * not a silent one.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const REGISTRY = path.join('src', 'navigation', 'registerCommands.ts')

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Scene/Wizard names imported into the stage builder from a scenes module, and
 * which of them are referenced inside the scenesToRegister array. A name that is
 * imported but not referenced in the array is the dead button.
 */
export function parseSceneRegistration(source: string): {
  imported: string[]
  registered: string[]
} {
  const body = strip(source)

  const imported = new Set<string>()
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*scenes[^'"]*['"]/g
  for (const m of body.matchAll(importRe)) {
    for (const raw of m[1].split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim()
      if (name && /(Scene|Wizard)$/.test(name)) imported.add(name)
    }
  }

  // Match to the first ] — the array holds scene names and a
  // ...getCategoryScenes() spread, no nested brackets — so this is robust to
  // both a one-line and a multi-line array.
  const arr = body.match(/scenesToRegister\s*=\s*\[([\s\S]*?)\]/)
  const arrayBody = arr ? arr[1] : ''

  const registered = [...imported].filter(name =>
    new RegExp(`\\b${name}\\b`).test(arrayBody)
  )

  return { imported: [...imported], registered }
}

/**
 * Scenes imported into the stage builder on purpose without being registered.
 * Empty today: every imported scene is in the array. The list exists so that a
 * future intentional exclusion carries a written reason instead of looking the
 * same as a forgotten one.
 */
const DELIBERATELY_UNREGISTERED: Record<string, string> = {}

describe('Telegraf scene registration', () => {
  const source = fs.readFileSync(REGISTRY, 'utf8')
  const { imported, registered } = parseSceneRegistration(source)
  const registeredSet = new Set(registered)

  it('parsing finds scene imports and the register array', () => {
    expect(imported.length).toBeGreaterThan(20)
    expect(registered.length).toBeGreaterThan(20)
  })

  it('every imported scene is registered or listed with a reason', () => {
    const unexplained = imported.filter(
      s => !registeredSet.has(s) && !DELIBERATELY_UNREGISTERED[s]
    )
    expect(unexplained).toEqual([])
  })

  it('no exception names a scene that is already registered', () => {
    const stale = Object.keys(DELIBERATELY_UNREGISTERED).filter(s =>
      registeredSet.has(s)
    )
    expect(stale).toEqual([])
  })

  // The ruler must key off USE inside the array, not the mere presence of an
  // import line. These synthetic sources pin that down.
  it('an imported-but-unlisted scene counts as NOT registered', () => {
    const src = [
      "import { realScene, forgottenScene } from '@/scenes'",
      'const scenesToRegister = [',
      '  realScene,',
      ']',
    ].join('\n')
    const { registered: reg } = parseSceneRegistration(src)
    expect(reg).toContain('realScene')
    expect(reg).not.toContain('forgottenScene')
  })

  it('a scene listed in the array counts as registered', () => {
    const src = [
      "import { fooWizard } from '@/scenes/foo'",
      'const scenesToRegister = [fooWizard]',
    ].join('\n')
    expect(parseSceneRegistration(src).registered).toContain('fooWizard')
  })
})
