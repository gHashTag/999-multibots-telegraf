/**
 * Ratchet for the ABANDONED-STREAM crash class (#1334/#1340).
 *
 * axios with responseType:'stream' returns a socket-backed Readable on
 * `response.data`. axios attaches NO 'error' listener on success, so if that
 * stream is never consumed/destroyed and later hits ECONNRESET/timeout, it
 * emits 'error' with zero listeners -> uncaughtException -> process.exit(1)
 * (errorHandler.ts:181) kills the single process running ALL bots. The #1334
 * kie-provider bug was exactly this: the success path read only .status/.headers
 * and abandoned .data.
 *
 * The pre-existing ratchets miss this variant: streamErrorListenerRatchet scans
 * only `X.pipe(`/`archiver()`, and stream-source-error scans only
 * `response.data.pipe(` — a header-only stream that is never piped is invisible.
 *
 * Rule (precise, low false-positive): for every
 *   const/let X = await axios[.get](..., responseType:'stream' ...)
 * the result's `.data` MUST be referenced somewhere after the assignment
 * (piped / pipelined / destroyed / on('error') / assigned / returned). A stream
 * whose `.data` is never referenced is abandoned. Covers both `axios.get(url,{})`
 * and `axios({method:'GET',...})` forms.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

// const/let X = await axios(...)  OR  await axios.get(...)  capturing the args up to the options object close
const ASSIGN =
  /(?:const|let)\s+(\w+)\s*=\s*await\s+axios(?:\.get)?\(([\s\S]*?\})\s*\)/g

describe('abandoned-stream ratchet (no responseType:stream result left unconsumed)', () => {
  it('every awaited axios stream result references its .data', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const src = fs.readFileSync(f, 'utf8')
      let m: RegExpExecArray | null
      ASSIGN.lastIndex = 0
      while ((m = ASSIGN.exec(src))) {
        const [, v, args] = m
        if (!/responseType:\s*['"]stream['"]/.test(args)) continue
        const after = src.slice(m.index + m[0].length)
        // The socket-backed stream lives on `.data`; it MUST be referenced
        // (piped/pipelined/destroyed/on-error/assigned). `return X.status`
        // does NOT consume the stream, so require `.data` specifically.
        const referenced = new RegExp(`\\b${v}\\.data\\b`).test(after)
        if (!referenced) {
          const rel = path.relative(process.cwd(), f)
          offenders.push(
            `${rel} :: ${v} (responseType:'stream' but ${v}.data never used -> abandoned socket, can crash the process)`
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
