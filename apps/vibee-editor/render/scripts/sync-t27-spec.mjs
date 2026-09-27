#!/usr/bin/env node
/**
 * A SPEC OF RECORD, BROUGHT IN FROM t27 AND GENERATED -- NEVER RETYPED.
 *
 * Owner, 2026-09-27: t27 is the language everything is eventually rewritten
 * in. A vertical is on that road when its numbers live in a .t27 spec in
 * gHashTag/t27 and the host IMPORTS them from `t27c gen-ts` output, instead of
 * restating them in TypeScript and citing the spec in a comment nobody checks.
 *
 * This copies the spec verbatim into src/spec/ and writes the compiler's own
 * TypeScript beside it. Both files are the compiler's and the spec's bytes:
 * the gen file is in .prettierignore, and src/spec/*.test.ts fails when the
 * two disagree or when the host restates a number the spec owns.
 *
 *   node scripts/sync-t27-spec.mjs <t27 checkout> <spec id>          # write
 *   node scripts/sync-t27-spec.mjs <t27 checkout> <spec id> --check  # compare
 *
 * <spec id> is the path under specs/ without the extension, e.g.
 * automation/crm-story-reel. T27C names the compiler (default: the release
 * build inside the checkout, then `t27c` on PATH).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [t27Dir, specId, flag] = process.argv.slice(2)
if (!t27Dir || !specId) {
  console.error('usage: sync-t27-spec.mjs <t27 checkout> <spec id> [--check]')
  process.exit(2)
}
const source = join(t27Dir, 'specs', `${specId}.t27`)
if (!existsSync(source)) {
  console.error(`no spec at ${source}`)
  process.exit(2)
}
const local = join(t27Dir, 'target', 'release', 't27c')
const t27c = process.env.T27C || (existsSync(local) ? local : 't27c')

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'spec')
const name = basename(specId)
const specOut = join(outDir, `${name}.t27`)
const genOut = join(outDir, `${name}.gen.ts`)

const spec = readFileSync(source, 'utf8')
let gen
try {
  gen = execFileSync(t27c, ['gen-ts', source], { encoding: 'utf8' })
} catch (e) {
  console.error(`t27c gen-ts failed: ${String(e.stderr || e.message)}`)
  process.exit(1)
}

if (flag === '--check') {
  const same =
    existsSync(specOut) &&
    existsSync(genOut) &&
    readFileSync(specOut, 'utf8') === spec &&
    readFileSync(genOut, 'utf8') === gen
  console.log(same ? `in sync: ${specId}` : `OUT OF SYNC: ${specId}`)
  process.exit(same ? 0 : 1)
}
writeFileSync(specOut, spec)
writeFileSync(genOut, gen)
console.log(`wrote ${specOut}\nwrote ${genOut}`)
