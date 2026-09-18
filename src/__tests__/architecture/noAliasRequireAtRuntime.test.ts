/**
 * `require('@/...')` WORKS ONLY BECAUSE SOMETHING BUNDLES IT.
 *
 * The `@/` prefix is a TypeScript path mapping. `import` statements are rewritten
 * by whatever builds the file; a runtime `require()` is not rewritten by anything
 * -- Node simply looks for a package literally called `@`. It survives in
 * production solely because the Docker build bundles with esbuild, which follows
 * tsconfig paths through `require()` too (checked on 2026-09-18: the bundle
 * carries no such call).
 *
 * Everywhere else it throws:
 *
 *   - vitest, which is a plain Node runtime with Vite aliases for IMPORTS only.
 *     `lipsync-models.config.ts` read the markup and the star price this way, so
 *     every price branch threw, and in the lip-sync wizard the throw landed in
 *     the outer catch and came out as "Audio processing error". The entire scene
 *     was untestable and the message pointed at the wrong thing.
 *   - `bun run dist/index.js` on an unbundled build, `tsx`, `ts-node`, a REPL.
 *   - and worst, inside a try/catch: three preflight call sites swallowed the
 *     failure, so a capability warning would simply never appear and nothing
 *     would say why.
 *
 * So this is a rule about the runtime, not a style preference: an aliased path
 * may be `import`ed statically or with `await import()`, both of which the
 * bundler and every other runtime understand. It may not be `require`d.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.join(__dirname, '..', '..', '..')

/*
 * THE POPULATION INCLUDES FILES GIT HAS NEVER SEEN.
 *
 * The first version asked `git ls-files`, and the repository's own meta-guard
 * (tools/no-silent-blindness) failed it on the spot: a new file carrying the
 * very pattern this forbids would not be in the index yet, so the guard would
 * pass on exactly the commit that introduced the offence. `repoFiles` adds the
 * untracked ones and refuses to run with a reader that cannot see.
 */
const { repoFiles, selfCheck } = createRequire(__filename)(
  path.join(ROOT, 'scripts', 'lib', 'repo-sources.cjs')
) as { repoFiles: (cwd: string) => string[]; selfCheck: (cwd: string) => void }

function sources() {
  selfCheck(ROOT)
  return repoFiles(ROOT)
    .filter(f => /^(src|apps)\//.test(f))
    .filter(f => /\.(ts|tsx)$/.test(f))
    .filter(f => !/node_modules/.test(f))
}

describe('an aliased path is never required at runtime', () => {
  it('has files to look at, so a green result means something', () => {
    // The failure this whole family keeps having: a clean verdict about nothing.
    expect(sources().length).toBeGreaterThan(500)
  })

  it('finds no require of an @/ path outside comments', () => {
    const offenders: string[] = []
    const files = sources()

    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
      if (!text.includes('@/')) continue
      text.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '')
        // A line inside a block comment starts with * once prettier has been
        // through it; this guard is about code, and the file above talks about
        // the very pattern it forbids.
        if (/^\s*\*/.test(code)) return
        if (/\brequire\(\s*['"]@\//.test(code)) {
          offenders.push(`${file}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      'these resolve only under a bundler; everywhere else they throw, and in a ' +
        'try/catch they fail silently. Use a static import or await import().'
    ).toEqual([])
  })
})
