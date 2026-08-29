/**
 * Every axios stream download must guard its SOURCE stream.
 *
 * axios `responseType: 'stream'` returns response.data as a Readable, and
 * `response.data.pipe(writer)` only wires the DESTINATION. If the source errors
 * mid-download (ECONNRESET, socket timeout), response.data emits 'error' with no
 * listener → Node raises it as an uncaughtException → the wired global handler
 * (errorHandler.ts: setupGlobalErrorHandlers) does process.exit(1) "for a clean
 * restart", taking the whole multi-bot process down. The surrounding try/catch
 * does NOT catch it (an emitted 'error' event is not a thrown exception), and
 * `writer.on('error')` only catches destination errors, not source ones.
 *
 * Fix (applied to every site): response.data.on('error', ...) that destroys the
 * writer and rejects, so the surrounding catch handles it and the process lives.
 *
 * This ratchet keeps the class closed: any file that pipes response.data must
 * attach at least as many source-error listeners as it has pipes. A new
 * unguarded `response.data.pipe(writer)` (or a removed listener) fails here.
 * (stream.pipeline() forwards source errors on its own and has no `.pipe(`, so
 * it is correctly not flagged.)
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
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

const countOf = (s: string, needle: string) => s.split(needle).length - 1

describe('every response.data.pipe() guards its source stream', () => {
  it('has a source-error listener for each response.data.pipe (no whole-process crash)', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const code = stripComments(fs.readFileSync(file, 'utf8'))
      const pipes = countOf(code, 'response.data.pipe(')
      if (pipes === 0) continue
      const guards = countOf(code, "response.data.on('error'")
      if (guards < pipes) {
        offenders.push(
          `${path.relative(SRC, file)}: ${pipes} pipe(s), ${guards} source-error listener(s)`
        )
      }
    }
    expect(
      offenders,
      `these files pipe response.data without a source-error listener ` +
        `(a mid-stream error crashes the whole process):\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
