import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertShellSafeJobId } from '@/inngest_app/functions/render/steps'

/**
 * render/steps.ts interpolates job_id into commands that ssh2 runs through the
 * REMOTE shell:
 *
 *   mkdir -p /renders/job_${job_id}/assets
 *   rm -rf   /renders/job_${job_id}
 *
 * and the event schema accepts any non-empty string -- schemas.ts has
 * `job_id: z.string().min(1)`, with no format at all. A job_id of `x /` makes
 * the second command two paths, the second being the render server's root.
 *
 * Every job_id production generates is already alphanumeric with dashes or
 * underscores (`telegram-<id>-<ts>`, `morphing_<id>_<ts>`), so the guard
 * refuses nothing that exists. It can only refuse; it never widens what runs.
 *
 * Both halves are tested: the shapes that must pass, because a guard that
 * rejected real ids would break rendering, and the shapes that must not,
 * one per metacharacter class.
 */

const ROOT = path.resolve(__dirname, '../../..')
const STEPS = 'src/inngest_app/functions/render/steps.ts'

describe('job_id reaching a remote shell command', () => {
  it('accepts every id production actually generates', () => {
    for (const real of [
      'telegram-144022504-1725000000000',
      'morphing_144022504_1725000000000',
      'job.1',
      'abc',
    ]) {
      expect(() => assertShellSafeJobId(real)).not.toThrow()
    }
  })

  it('refuses each metacharacter class separately', () => {
    const attacks: Array<[string, string]> = [
      ['space makes a second path', 'x /'],
      ['semicolon chains a command', 'x;rm -rf /'],
      ['backtick substitutes', 'x`id`'],
      ['dollar-paren substitutes', 'x$(id)'],
      ['pipe redirects', 'x|id'],
      ['ampersand backgrounds', 'x&id'],
      ['newline is a statement separator', 'x\nid'],
      ['double quote escapes the quoted form used elsewhere', 'x"y'],
      ['single quote escapes the autonomousMonitor form', "x'y"],
      ['dot-dot climbs out of the job directory', '../../etc'],
      ['empty is not a directory', ''],
    ]
    for (const [why, value] of attacks) {
      expect(() => assertShellSafeJobId(value), why).toThrow()
    }
  })

  it('is actually called before both interpolations', () => {
    // The behavioural test above passes whether or not steps.ts calls the
    // guard. This reads the source and requires the call to come BEFORE the
    // line that builds the path, since a guard after the fact guards nothing.
    const src = fs.readFileSync(path.join(ROOT, STEPS), 'utf8').split('\n')
    const builds = src
      .map((l, i) => [l, i] as const)
      .filter(([l]) => l.includes('const jobDir = `/renders/job_${job_id}`'))
    expect(builds.length).toBe(2)
    for (const [, i] of builds) {
      expect(src[i - 1]).toContain('assertShellSafeJobId(job_id)')
    }
  })
})
