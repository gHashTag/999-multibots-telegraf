#!/usr/bin/env node
/**
 * DO THE SKILLS STILL DESCRIBE THIS REPOSITORY?
 *
 * Forty-one skills, 28 000 lines, written over months and never checked against
 * the tree they describe. A skill citing a file that moved sends the next
 * reader — or the next agent — to a path that does not exist, and it does so
 * with the authority of documentation.
 *
 * ── TWO KINDS OF ROT, AND THEY NEED DIFFERENT ANSWERS ─────────────────────
 *
 *   MOVED    the file exists elsewhere. `scripts/check-infisical-keys.ts` is
 *            now `scripts/infisical/check-infisical-keys.ts`. Fixable
 *            mechanically, and this script prints the new path.
 *   GONE     no file of that name anywhere. `AssetBrowser.tsx`,
 *            `video.pipeline.ts`, `heygen-avatar-wizard.ts`. Needs a person:
 *            the feature may have been renamed, replaced or dropped.
 *
 * ── THE CHECKER WAS WRONG BEFORE THE DATA WAS ─────────────────────────────
 *
 * Its first version resolved every path against the repository root and
 * reported 61% missing. Most of that was false: skills cite paths relative to
 * the context they establish -- the player app, the render app, the skill's own
 * directory. Resolving against those bases dropped it to 29%, and a sample of
 * those was then checked by hand before the number was believed.
 *
 * A documentation checker that cries wolf gets switched off in a week, which is
 * worse than not having one.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SKILLS = path.join(ROOT, '.claude', 'skills')

/**
 * Bases a skill may be writing relative to.
 *
 * Not a guess: each one appears in a real skill. Adding a base makes the check
 * WEAKER, so the list stays short and every entry has to earn its place.
 */
const BASES = [
  '.',
  'src',
  'apps/vibee-editor',
  'apps/vibee-editor/player',
  'apps/vibee-editor/player/src',
  'apps/vibee-editor/render',
  'apps/vibee-ios/Vibee',
]

const CITED =
  /`([a-zA-Z0-9_][a-zA-Z0-9_./-]*\.(?:ts|tsx|js|mjs|cjs|yaml|yml|sh|swift|rs|zig|t27|json))`/g

/** Where else in the tree does a file with this basename live? */
function findElsewhere(base) {
  try {
    const out = execFileSync('git', ['ls-files', '--', `*/${base}`, base], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function main() {
  const rows = []
  let cited = 0

  for (const dir of fs.readdirSync(SKILLS).sort()) {
    const skill = path.join(SKILLS, dir)
    const file = path.join(skill, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const bases = [...BASES.map(b => path.join(ROOT, b)), skill]

    for (const m of text.matchAll(CITED)) {
      const ref = m[1]
      // A bare filename is a mention, not a path -- checking it would flag
      // every prose reference to a file the reader is expected to find.
      if (!ref.includes('/')) continue
      cited++
      if (bases.some(b => fs.existsSync(path.join(b, ref)))) continue

      /*
       * A basename match is only evidence when it is UNIQUE.
       *
       * The first version claimed `src/sceneFactory/index.ts` had moved to
       * `packages/vibee-atoms/src/index.ts`, and `services/heygen/client.ts`
       * to `core/neon/client.ts`. Both wrong, and wrong in the worst
       * direction: a confident pointer at the wrong file is more harmful than
       * an honest "gone", because the reader follows it.
       *
       * Several candidates therefore means AMBIGUOUS, not MOVED. Names like
       * index.ts and client.ts live in dozens of places and prove nothing.
       */
      const alt = findElsewhere(path.basename(ref))
      const kind =
        alt.length === 1 ? 'ПЕРЕЕХАЛ' : alt.length ? 'НЕОДНОЗНАЧНО' : 'УДАЛЁН'
      rows.push({
        skill: dir,
        ref,
        kind,
        now: alt.length === 1 ? alt[0] : null,
        n: alt.length,
      })
    }
  }

  const moved = rows.filter(r => r.kind === 'ПЕРЕЕХАЛ')
  const gone = rows.filter(r => r.kind === 'УДАЛЁН')
  const vague = rows.filter(r => r.kind === 'НЕОДНОЗНАЧНО')

  console.log(`[скиллы] путей в описаниях : ${cited}`)
  console.log(
    `[скиллы] ПЕРЕЕХАЛИ         : ${moved.length}  (чинится автоматически)`
  )
  console.log(`[скиллы] УДАЛЕНЫ           : ${gone.length}  (нужен человек)`)
  console.log(
    `[скиллы] НЕОДНОЗНАЧНО      : ${vague.length}  (имя встречается всюду)`
  )

  if (moved.length) {
    console.log('\n— переехали —')
    for (const r of moved.slice(0, 20)) {
      console.log(`  ${r.skill}\n      ${r.ref}\n   -> ${r.now}`)
    }
  }
  if (vague.length) {
    console.log('\n— имя слишком общее, чтобы утверждать переезд —')
    for (const r of vague.slice(0, 10)) {
      console.log(`  ${r.skill.padEnd(28)} ${r.ref}  (${r.n} кандидатов)`)
    }
  }
  if (gone.length) {
    console.log('\n— удалены, описание ведёт в никуда —')
    for (const r of gone.slice(0, 20)) {
      console.log(`  ${r.skill.padEnd(30)} ${r.ref}`)
    }
  }

  /*
   * Exit 0 on findings, deliberately.
   *
   * This is a REPORT, not a gate. Making stale documentation break the build
   * would mean the next person to touch an unrelated skill inherits somebody
   * else's rot, and the honest response to that is to delete the check.
   */
  if (!rows.length) console.log('\n✅ все упомянутые пути существуют')
}

main()
