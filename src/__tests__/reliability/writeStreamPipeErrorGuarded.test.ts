/**
 * Every createWriteStream that is a pipe() DESTINATION must guard its own errors.
 *
 * `src.pipe(output)` where `output = fs.createWriteStream(path)` wires only the
 * flow. Node's pipe does NOT forward the DESTINATION's 'error' to the source,
 * and an archiver's own `archive.on('error')` covers only archiver-internal
 * faults -- not the write stream. So if `output` emits 'error' (ENOSPC / EMFILE
 * / EACCES during finalize), it is an unhandled EventEmitter 'error' event ->
 * Node raises uncaughtException -> the wired global handler
 * (errorHandler.ts: setupGlobalErrorHandlers) does process.exit(1), taking the
 * whole multi-bot process down. The surrounding Promise/try-catch cannot catch
 * it (an emitted 'error' is not a thrown exception).
 *
 * Sibling of stream-source-error.test.ts (#1234), which guards the axios SOURCE
 * side (`response.data.pipe`). This guards the DESTINATION side.
 *
 * Fix (applied at every site): `output.on('error', err => reject(err))` so the
 * error surfaces through the surrounding catch and the process lives.
 *
 * The ratchet: in any file, a createWriteStream bound to a variable that is used
 * as a `.pipe(<var>)` destination must also have a `<var>.on('error'` listener.
 * Streams consumed via stream.pipeline()/pipelineAsync (which forward errors and
 * do not use `.pipe(<var>)`) are correctly not flagged.
 *
 * loop-fable iter202 (generateScenarioClips + instagramScraper-v2, wave-7 hunt).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const SRC = path.join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      walk(p, out)
    } else if (p.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Returns the write-stream destination variable names that are piped into but
 * lack their own error listener, for one file's (comment-stripped) source.
 */
function unguardedWriteStreamDests(code: string): string[] {
  const offenders: string[] = []
  // const/let <name> = [fs.|require('fs').]createWriteStream(
  const declRe =
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:require\(['"]fs['"]\)\.|[A-Za-z_$][\w$]*\.)?createWriteStream\s*\(/g
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = declRe.exec(code))) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const escaped = name.replace(/[$]/g, '\\$&')
    const isPipeDest = new RegExp(`\\.pipe\\(\\s*${escaped}\\s*\\)`).test(code)
    if (!isPipeDest) continue
    const hasErr = new RegExp(`${escaped}\\s*\\.on\\(\\s*['"]error['"]`).test(
      code
    )
    if (!hasErr) offenders.push(name)
  }
  return offenders
}

describe('every createWriteStream pipe destination guards its own errors', () => {
  const files = walk(SRC)

  it('has no piped write stream without an error listener (no whole-process crash)', () => {
    const offenders: string[] = []
    let dests = 0
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'))
      if (!code.includes('createWriteStream')) continue
      // count destinations for the floor
      const declRe =
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:require\(['"]fs['"]\)\.|[A-Za-z_$][\w$]*\.)?createWriteStream\s*\(/g
      let dm: RegExpExecArray | null
      while ((dm = declRe.exec(code))) {
        const esc = dm[1].replace(/[$]/g, '\\$&')
        if (new RegExp(`\\.pipe\\(\\s*${esc}\\s*\\)`).test(code)) dests++
      }
      for (const bad of unguardedWriteStreamDests(code)) {
        offenders.push(`${path.relative(SRC, file)}: ${bad}`)
      }
    }
    // matcher-not-stale floor: this class has real piped write-stream
    // destinations in the tree; a scanner that finds zero is broken/vacuous.
    expect(dests).toBeGreaterThanOrEqual(2)
    expect(offenders).toEqual([])
  })

  it('self-check: the scanner catches an injected unguarded write stream', () => {
    const bad = `
      const output = fs.createWriteStream(p)
      archive.on('error', e => reject(e))
      archive.pipe(output)`
    expect(unguardedWriteStreamDests(bad)).toContain('output')
    const good = bad + `\n      output.on('error', e => reject(e))`
    expect(unguardedWriteStreamDests(good)).toEqual([])
  })
})
