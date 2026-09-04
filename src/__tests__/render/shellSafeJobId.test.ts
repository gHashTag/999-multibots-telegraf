import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertShellSafeJobId } from '@/inngest_app/functions/render/helpers/jobId'

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

  it('is actually called before every interpolation, in both pipelines', () => {
    // The behavioural test above passes whether or not the pipelines call the
    // guard. This reads the source and requires the call to come BEFORE the
    // line that builds the path, since a guard after the fact guards nothing.
    //
    // Both pipelines, because both are registered: renderFunction uses
    // helpers/renderSteps.ts and renderRiddleFunction uses steps.ts. Checking
    // only the one that was fixed first would have said the class was closed
    // while the live pipeline was still open.
    const sites: Array<[string, RegExp]> = [
      [
        'src/inngest_app/functions/render/steps.ts',
        /const jobDir = `\/renders\/job_\$\{job_id\}`/,
      ],
      [
        'src/inngest_app/functions/render/helpers/renderSteps.ts',
        /const jobDir = RenderConfig\.getJobDir\(job_id\)/,
      ],
    ]
    for (const [file, builds] of sites) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
      const hits = src
        .map((l, i) => [l, i] as const)
        .filter(([l]) => builds.test(l))
      expect(hits.length, `${file} should build jobDir twice`).toBe(2)
      for (const [, i] of hits) {
        expect(src[i - 1], `${file}:${i + 1}`).toContain(
          'assertShellSafeJobId(job_id)'
        )
      }
    }
  })
})
