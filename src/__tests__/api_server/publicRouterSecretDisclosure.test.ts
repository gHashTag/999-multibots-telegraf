import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Routers are mounted in two groups in src/api_server/index.ts:
 *
 *   app.use('/api', someRouter)                      <- world-readable
 *   app.use('/api', requireInternalKey, someRouter)  <- gated
 *
 * A response of the form `{ SOME_KEY: !!process.env.SOME_KEY }` tells an
 * anonymous caller which credentials the deployment holds. That is fine in the
 * gated group -- diagnostic.routes reports exactly that -- and not fine in the
 * open one. github-autofixer was the single router where the same disclosure
 * was public, and `webhook_secret: false` there would have told a caller the
 * signed webhook cannot verify, which is a hint about what to try.
 *
 * The rule is therefore about the PAIRING, not about the pattern: which group
 * a router is mounted in decides whether it may report configuration. Written
 * against the mount list so a new router lands on the correct side of it by
 * being checked, rather than by whoever adds it remembering.
 *
 * Reading the mount list from index.ts rather than listing routers here, for
 * the reason a previous iteration learned the hard way: a hand-written list
 * repeats the blind spot of whoever wrote it.
 */

const ROOT = path.resolve(__dirname, '../../..')
const INDEX = 'src/api_server/index.ts'

/** Router variable -> guarded by requireInternalKey at its mount site. */
function mounts(): Map<string, boolean> {
  const src = fs.readFileSync(path.join(ROOT, INDEX), 'utf8')
  const out = new Map<string, boolean>()
  for (const m of src.matchAll(/app\.use\(\s*'[^']*'\s*,\s*([^)]+)\)/g)) {
    const args = m[1].split(',').map(a => a.trim())
    const guarded = args.includes('requireInternalKey')
    for (const a of args) {
      if (/Router$/.test(a)) out.set(a, guarded)
    }
  }
  return out
}

/** Router variable -> the file it is imported from. */
function routerFiles(): Map<string, string> {
  const src = fs.readFileSync(path.join(ROOT, INDEX), 'utf8')
  const out = new Map<string, string>()
  for (const m of src.matchAll(
    /^import\s+([A-Za-z_$][\w$]*)(?:\s*,\s*\{[^}]*\})?\s*from\s*'(\.\/routes\/[^']+)'/gm
  )) {
    out.set(m[1], `src/api_server/${m[2].replace(/^\.\//, '')}.ts`)
  }
  return out
}

/**
 * The serialisable shape: a NAMED PROPERTY whose value is the presence of a
 * secret. That is what reaches a caller.
 *
 * Scoped to the property, not to the res.json call. A first version matched
 * inside `res.json({ ... })` and was blind to the actual code here, which
 * builds the object in a variable and sends `res.json(health)` -- putting the
 * disclosure back survived that check untouched. Computing a plain boolean is
 * still allowed, and github-autofixer derives its degraded status that way.
 */
const DISCLOSURE = /[A-Za-z_$][\w$]*\s*:\s*!!\s*process\.env\.[A-Z0-9_]+/g

describe('a publicly mounted router', () => {
  it('reads the mount list at all', () => {
    // Control: an empty map would make every assertion below vacuous, which is
    // precisely how a guard like this rots.
    const m = mounts()
    expect(m.size).toBeGreaterThanOrEqual(8)
    expect([...m.values()].filter(Boolean).length).toBeGreaterThanOrEqual(3)
    expect([...m.values()].filter(v => !v).length).toBeGreaterThanOrEqual(3)
  })

  it('resolves each mounted router to a file', () => {
    const files = routerFiles()
    const unresolved = [...mounts().keys()].filter(r => !files.has(r))
    expect(unresolved).toEqual([])
  })

  it('never reports which secrets are configured', () => {
    const files = routerFiles()
    const offenders: string[] = []
    for (const [router, guarded] of mounts()) {
      if (guarded) continue
      const f = files.get(router)
      if (!f || !fs.existsSync(path.join(ROOT, f))) continue
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      const found = src.match(DISCLOSURE)
      if (found) offenders.push(`${f}: ${found.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('would notice the disclosure it removed', () => {
    // Positive control for the matcher itself: the shape that was there.
    // The shape that was there, and the shape that must stay allowed.
    expect(
      'checks: { webhook_secret: !!process.env.GITHUB_WEBHOOK_SECRET }'.match(
        DISCLOSURE
      )
    ).toEqual(['webhook_secret: !!process.env.GITHUB_WEBHOOK_SECRET'])
    expect('const ok = !!process.env.GITHUB_TOKEN'.match(DISCLOSURE)).toBeNull()
  })
})
