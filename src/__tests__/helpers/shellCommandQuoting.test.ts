import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Modules that build a command string and hand it to child_process `exec` run
 * that string through a SHELL, so every interpolation in the template is
 * shell-interpreted.
 *
 * The population is small enough to state: these two files each wrap `exec`
 * in an execAsync helper and build ffmpeg/ffprobe command templates. Every
 * template but one already quoted its interpolations; the exception was
 *
 *   ffmpeg -f concat -safe 0 -i ${listPath} ... -y ${outputPath}
 *
 * and outputPath is not a constant. generateAdvancedLoopingVideoFunction --
 * registered in registerFunctions.ts -- builds it as
 * `reels_kling_v7_${telegram_id}_${Date.now()}` with telegram_id destructured
 * straight off event.data and never validated.
 *
 * So the rule is the one the files already followed by habit, made explicit:
 * an interpolation inside a command template passed to a shell must be
 * quoted. Habit is what let one line drift out of line with the other three.
 *
 * Quoting is not the whole answer -- a value containing a double quote still
 * escapes it -- which is why job_id, whose value crosses an SSH boundary, is
 * validated instead (steps.ts). Here the values are paths this process builds
 * itself, and matching the file's own convention is the surgical fix.
 */

const ROOT = path.resolve(__dirname, '../../..')

const SHELL_EXEC_FILES = [
  'src/helpers/video-helpers.ts',
  'src/services/localMorphingProcessor.ts',
]

/** Command templates: backtick strings starting with a known shell binary. */
function commandTemplates(source: string): string[] {
  return [...source.matchAll(/`(ffmpeg|ffprobe)[^`]*`/g)].map(m => m[0])
}

/** Interpolations that are not wrapped in double quotes. */
function unquotedInterpolations(template: string): string[] {
  const out: string[] = []
  const re = /\$\{[^}]+\}/g
  for (const m of template.matchAll(re)) {
    const before = template[m.index! - 1]
    const after = template[m.index! + m[0].length]
    // Inside an already-quoted argument, e.g. "scale=${w}:${h}", the quotes sit
    // further out; accept the interpolation if a quote opens before it on the
    // same argument and closes after it.
    const head = template.slice(0, m.index!)
    const quotesBefore = (head.match(/"/g) || []).length
    const insideQuotes = quotesBefore % 2 === 1
    if (before === '"' && after === '"') continue
    if (insideQuotes) continue
    out.push(m[0])
  }
  return out
}

describe('shell command templates quote what they interpolate', () => {
  it('finds the templates at all', () => {
    // Control: an empty population would make the assertion below vacuous.
    const all = SHELL_EXEC_FILES.flatMap(f =>
      commandTemplates(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    )
    expect(all.length).toBeGreaterThanOrEqual(6)
  })

  it('confirms these files really do run a shell', () => {
    for (const f of SHELL_EXEC_FILES) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      expect(src).toMatch(/from 'child_process'/)
      expect(src).toMatch(/\bexec\(/)
    }
  })

  it('leaves no interpolation unquoted', () => {
    const offenders: string[] = []
    for (const f of SHELL_EXEC_FILES) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const tpl of commandTemplates(src)) {
        for (const bad of unquotedInterpolations(tpl)) {
          offenders.push(`${f}: ${bad} in ${tpl.slice(0, 60)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('would notice an unquoted interpolation', () => {
    // The matcher's own positive control. Without this, a detector that always
    // returned [] would make the check above pass while reading nothing.
    expect(unquotedInterpolations('`ffmpeg -i ${a} -y "${b}"`')).toEqual([
      '${a}',
    ])
    expect(unquotedInterpolations('`ffmpeg -i "${a}" -y "${b}"`')).toEqual([])
  })
})
