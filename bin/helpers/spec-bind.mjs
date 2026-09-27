#!/usr/bin/env node
/**
 * tri spec-bind <kind/id> [t27 checkout] -- start binding a t27 spec of
 * record in one command (skill t27-spec-first, "Рецепт: привязать вертикаль").
 *
 * Binding by hand took the same five steps each time and one of them was
 * always forgotten: vendor the spec with its gen-ts output, write the host
 * test with every spec test title word for word, import the generated
 * module somewhere in the host, take the spec off the ratchet, run the
 * checker. This does the mechanical four and leaves the one that needs a
 * mind -- running each spec test against the host -- as FAILING placeholders,
 * so an unbound title can never pass for a bound one.
 *
 * It never overwrites a test that exists: a binding already written is
 * work, and a new loop tick must not undo the last one.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { specTests } from '../../scripts/check-t27-specs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RENDER = join(ROOT, 'apps', 'vibee-editor', 'render')
const SPEC_DIR = join(RENDER, 'src', 'spec')

const [specId, t27Arg] = process.argv.slice(2)
if (!specId || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(specId)) {
  console.error(
    'usage: tri spec-bind <kind/id> [t27 checkout]   e.g. automation/crm-duet'
  )
  process.exit(2)
}
const t27 = t27Arg || process.env.T27 || '/home/user/t27'
const id = specId.split('/')[1]
const src = join(t27, 'specs', `${specId}.t27`)
if (!existsSync(src)) {
  console.error(`no ${src} -- is ${t27} a t27 checkout on master?`)
  process.exit(1)
}

// 1. Vendor the spec and its gen-ts output (the sync script runs the checker).
console.log(`-- vendor ${specId}`)
try {
  execFileSync(
    'node',
    [join(RENDER, 'scripts', 'sync-t27-spec.mjs'), t27, specId],
    {
      stdio: 'inherit',
    }
  )
} catch {
  // The checker is expected to complain until the binding exists.
}

// 2. The host test: every spec title, failing until it runs the host.
const testFile = join(SPEC_DIR, `${id}.test.ts`)
const tests = specTests(readFileSync(src, 'utf8'))
if (existsSync(testFile)) {
  const have = readFileSync(testFile, 'utf8')
  const missing = tests.filter(t => !have.includes(t.title))
  console.log(
    `-- ${id}.test.ts exists; not touched. Titles not yet in it: ${missing.length}`
  )
  for (const t of missing) console.log(`   - ${t.title}`)
} else {
  const q = s => JSON.stringify(s)
  const body = tests
    .map(
      t => `  it(${q(t.title)}, () => {
    // spec line ${t.line}: run this against the HOST, with the spec's inputs.
    throw new Error('not bound yet: ${id} line ${t.line}')
  })`
    )
    .join('\n\n')
  writeFileSync(
    testFile,
    `import { describe, expect, it } from 'vitest'
import * as SPEC from './${id}.gen'

/**
 * ${id.toUpperCase().replace(/-/g, ' ')} IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/${specId}.t27 is the spec of record. Each \`test\` of the
 * spec runs here against the HOST. Scaffolded by tri spec-bind: every
 * placeholder fails until it calls the host.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> ${specId}
 */
describe("the spec's tests hold against the host", () => {
  it('the generated module is the spec of record', () => {
    expect(SPEC.ID).toBe(${q(id)})
  })

${body}
})
`
  )
  console.log(
    `-- wrote ${testFile.replace(ROOT + '/', '')}: ${tests.length} failing placeholders`
  )
}

// 3. Off the ratchet: a bound spec is no longer debt.
const manifestFile = join(ROOT, 'scripts', 't27-specs.json')
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
if (manifest.unbound?.includes(specId)) {
  manifest.unbound = manifest.unbound.filter(x => x !== specId)
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `-- removed ${specId} from scripts/t27-specs.json unbound (${manifest.unbound.length} left)`
  )
}

// 4. What is left: the host import and the placeholders.
console.log(`-- next:
   * import * as SPEC from '../spec/${id}.gen' in the host file(s) the spec names, and use
     its values instead of literals (laws: host-imports, restated);
   * replace each placeholder with a call to the host (the placeholders keep the suite red
     until the binding is real);
   * node scripts/check-t27-specs.mjs --t27 ${t27} --run`)
