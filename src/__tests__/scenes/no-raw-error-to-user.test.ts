import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A user-facing error message must not echo a raw JS Error.
 *
 * Some catch blocks replied with `❌ ... Error: ${error.message}` — the text of
 * a caught exception, shown to the person. That leaks internal detail (a stack
 * fragment, a provider SDK string, the shape of a code bug) and reads as a
 * broken bot rather than a handled failure. The detail belongs in the logs,
 * where these blocks already put it; the reply should be a clean, friendly
 * line.
 *
 * This scans the scene sources for template literals that carry the user error
 * marker ❌ AND interpolate a raw JS error (error.message / error.stack /
 * String(error)), and requires there be none. It deliberately does NOT flag
 * Zod validation text (error.errors[].message — that IS the user's feedback) or
 * a provider's response.error, which are different variables.
 */

const RAW = /error\.(message|stack)|String\(\s*error\s*\)/

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...tsFiles(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

function leakingLiterals(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/`(?:[^`\\]|\\.)*`/g)) {
    const lit = m[0]
    if (lit.includes('❌') && RAW.test(lit)) {
      out.push(lit.slice(0, 60).replace(/\n/g, ' '))
    }
  }
  return out
}

describe('scenes and inngest functions do not echo a raw JS error to the user', () => {
  // Both surfaces reply to the user directly: scenes via ctx.reply, inngest
  // functions via bot.telegram.sendMessage. The scan covered only src/scenes,
  // so two inngest leaks (morphImages, modelTrainingV2) went unseen — include
  // src/inngest_app too.
  const files = [
    ...tsFiles(path.join('src', 'scenes')),
    ...tsFiles(path.join('src', 'inngest_app')),
  ]

  it('finds the sources', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no user error (❌) message interpolates error.message/stack/String(error)', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const lit of leakingLiterals(fs.readFileSync(f, 'utf8'))) {
        offenders.push(`${f}: ${lit}`)
      }
    }
    expect(
      offenders,
      `raw error text shown to users:\n${offenders.join('\n')}`
    ).toEqual([])
  })

  it('no source passes a raw caught error to sendGenericErrorMessage', () => {
    // sendGenericErrorMessage(ctx, isRu, error) puts error.message straight into
    // ctx.reply, so it leaks the raw exception to the user (CWE-209) — the same
    // class as above but via the helper, which the literal scan misses. The error
    // is already logged in each catch; the reply must stay generic. Passing a
    // deliberate custom string is fine; passing the caught `error` is not.
    const offenders: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(
        /sendGenericErrorMessage\([^)]*,[^)]*,\s*error\b[^)]*\)/g
      )) {
        offenders.push(`${f}: ${m[0].slice(0, 70)}`)
      }
    }
    expect(
      offenders,
      `raw error passed to sendGenericErrorMessage:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
