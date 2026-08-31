/**
 * Ratchet: KieVeedFabricProvider.getStatus() parses the QUERY response shape.
 *
 * getStatus() polls https://api.kie.ai/api/v1/jobs/taskStatus -- the same
 * endpoint the sibling wan25-helpers.ts polls. That query response carries
 * data.state ('waiting'|'queuing'|'generating'|'success'|'fail'), the result
 * URLs inside the JSON string data.resultJson, and failures in data.failMsg.
 *
 * getStatus() used to read data.successFlag / data.resultUrls / data.errorMsg
 * instead -- those are the WEBHOOK callback payload's field names, not the query
 * response's. So no terminal branch ever matched: every response fell through to
 * the 'processing' fallback, and on a lost delivery webhook the fallback poll
 * never delivered a completed job nor failed a failed one -- it ran to the
 * 10-min timeout that refunds a job Kie actually produced.
 *
 * This pins the fix: the terminal-state detection must key off data.state and
 * read data.resultJson, and must NOT gate success on the webhook-only
 * successFlag field. Comments are stripped first, so the explanatory comment
 * (which names the old fields) does not satisfy or trip the checks.
 *
 * loop-fable iter202 (wave-7 status-enum-drift lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../core/lipsync/providers/kie-veed-fabric-provider.ts'
)

const stripComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function analyze(source: string): {
  readsSuccessState: boolean
  readsFailState: boolean
  readsResultJson: boolean
  gatesOnSuccessFlag: boolean
} {
  const code = stripComments(source)
  return {
    readsSuccessState: /state\s*===\s*'success'/.test(code),
    readsFailState: /state\s*===\s*'fail'/.test(code),
    readsResultJson: /resultJson/.test(code),
    // the stale webhook-only gate that made every terminal state a miss
    gatesOnSuccessFlag: /successFlag/.test(code),
  }
}

describe('KieVeedFabricProvider.getStatus reads the taskStatus query shape', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('keys terminal detection off data.state (success + fail)', () => {
    expect(a.readsSuccessState).toBe(true)
    expect(a.readsFailState).toBe(true)
  })

  it('reads the result URL from data.resultJson', () => {
    expect(a.readsResultJson).toBe(true)
  })

  it('does not gate on the webhook-only successFlag field', () => {
    expect(a.gatesOnSuccessFlag).toBe(false)
  })

  it('self-check: the analyzer detects the old successFlag-gated shape', () => {
    const oldShape = `
      const data = response.data.data || response.data
      if (data.successFlag === true || data.success === true) {
        const resultUrls = data.resultUrls || []
        return { status: 'completed', output: resultUrls[0] }
      }
      if (data.status === 'processing' || data.successFlag === false) {
        return { status: 'processing' }
      }`
    const old = analyze(oldShape)
    expect(old.gatesOnSuccessFlag).toBe(true)
    expect(old.readsSuccessState).toBe(false)
    expect(old.readsResultJson).toBe(false)
  })
})
