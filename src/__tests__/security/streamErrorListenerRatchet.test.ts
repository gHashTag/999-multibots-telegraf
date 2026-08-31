/**
 * Completeness ratchet for the stream-crash class (#1234 axios streams, #1313
 * createImagesZip archiver). A readable/archiver EventEmitter that is .pipe()'d
 * (or an archiver) and has NO 'error' listener on the SOURCE turns any emitter
 * error (bad buffer, ENOSPC, zlib failure, socket reset) into an uncaughtException
 * that crashes the whole single process -- every bot goes down.
 *
 * This walks src/ and, for each `X.pipe(` and each `archiver()` assigned to a
 * var, asserts the source var has an `X.on('error'` listener in the same file.
 * Offenders must be empty (or in DEBT, an allowlist for cases whose error is
 * handled by a different mechanism -- add with a reason). A new unguarded pipe
 * or archiver fails this test. Currently the class is closed (0 offenders).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// files whose piped source handles errors by another mechanism (document why)
const DEBT: string[] = []

function collect(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.test.ts') &&
      !p.includes(`${path.sep}test${path.sep}`)
    )
      out.push(p)
  }
  return out
}

const hasErrorListener = (s: string, src: string) =>
  new RegExp(`\\b${src}\\.on\\(\\s*['"]error`).test(s)

describe('stream/archiver sources have an error listener (no process crash)', () => {
  it('every piped/archiver source registers on(error)', () => {
    const root = path.join(__dirname, '..', '..')
    const files = collect(root, [])
    const offenders: string[] = []
    for (const f of files) {
      const rel = 'src/' + path.relative(root, f).split(path.sep).join('/')
      if (DEBT.includes(rel)) continue
      const s = fs.readFileSync(f, 'utf8')
      let m: RegExpExecArray | null
      const pipeRe = /(\w+)\.pipe\(/g
      while ((m = pipeRe.exec(s))) {
        if (!hasErrorListener(s, m[1]))
          offenders.push(`${rel} :: ${m[1]}.pipe (no ${m[1]}.on('error'))`)
      }
      const arcRe = /(?:const|let)\s+(\w+)\s*=\s*archiver\(/g
      while ((m = arcRe.exec(s))) {
        if (!hasErrorListener(s, m[1]))
          offenders.push(`${rel} :: archiver ${m[1]} (no ${m[1]}.on('error'))`)
      }
    }
    expect(
      offenders,
      `stream/archiver source(s) without an on('error') listener -- an emitter error would crash the process:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
