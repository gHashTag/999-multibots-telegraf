import { describe, it, expect, beforeEach } from 'vitest'
import {
  refusalCodeFor,
  stampRefusalCode,
  GENERATION_REFUSAL_CODES,
} from './generation-refusal'
import { startJob, recordInto, getJob, _resetJobs } from './generate-jobs'

/*
 * A FAILED GENERATION CARRIES A NAME, NOT ONLY A SENTENCE.
 *
 * The clients used to show the server's `error` as it came: billing reasons
 * in Russian, provider dumps in English, and on the web the whole JSON body.
 * These pin the name the server now adds, on the answer and on the job the
 * app recovers after a dropped connection.
 */

/** A stand-in for `http.ServerResponse`: status set by writeHead, body by end. */
function fakeRes() {
  const r = {
    statusCode: 200,
    sent: undefined as string | undefined,
    writeHead(status: number) {
      r.statusCode = status
      return r
    },
    end(chunk?: any) {
      r.sent = chunk == null ? undefined : String(chunk)
      return r
    },
  }
  return r
}

describe('a failed generation names itself', () => {
  beforeEach(() => _resetJobs())

  it('each status class has its own name', () => {
    expect(refusalCodeFor(400)).toBe('bad_input')
    expect(refusalCodeFor(401)).toBe('sign_in')
    expect(refusalCodeFor(402)).toBe('not_enough_tokens')
    expect(refusalCodeFor(403)).toBe('forbidden')
    expect(refusalCodeFor(503)).toBe('unavailable')
    expect(refusalCodeFor(500)).toBe('generation_failed')
    expect(refusalCodeFor(502)).toBe('generation_failed')
    // Every name the function can give is in the published list.
    for (const s of [400, 401, 402, 403, 404, 422, 500, 502, 503, 504])
      expect(GENERATION_REFUSAL_CODES).toContain(refusalCodeFor(s))
  })

  it('a failure body gains a code and keeps its detail', () => {
    const res = fakeRes()
    stampRefusalCode(res)
    res.writeHead(402)
    res.end(JSON.stringify({ success: false, error: 'need 20, have 16' }))
    expect(JSON.parse(res.sent!)).toEqual({
      success: false,
      error: 'need 20, have 16',
      code: 'not_enough_tokens',
    })
  })

  it('a route that named its failure is left alone', () => {
    const res = fakeRes()
    stampRefusalCode(res)
    res.writeHead(400)
    res.end(JSON.stringify({ success: false, error: 'x', code: 'own_name' }))
    expect(JSON.parse(res.sent!).code).toBe('own_name')
  })

  it('success, non-JSON and empty answers go out exactly as written', () => {
    const ok = fakeRes()
    stampRefusalCode(ok)
    ok.writeHead(200)
    const body = JSON.stringify({ success: true, url: 'https://x/y.png' })
    ok.end(body)
    expect(ok.sent).toBe(body)

    const html = fakeRes()
    stampRefusalCode(html)
    html.writeHead(502)
    html.end('<html>bad gateway</html>')
    expect(html.sent).toBe('<html>bad gateway</html>')

    const empty = fakeRes()
    stampRefusalCode(empty)
    empty.writeHead(500)
    empty.end()
    expect(empty.sent).toBeUndefined()
  })

  it('the recovered job carries the same name as the answer', () => {
    // The route's order: the stamp first, `recordInto` later and so outside.
    const res = fakeRes()
    stampRefusalCode(res)
    const job = startJob('video', '4242', 'a cat')
    recordInto(job, res)
    res.writeHead(500)
    res.end(
      JSON.stringify({ success: false, error: 'Video generation timeout' })
    )
    expect(JSON.parse(res.sent!).code).toBe('generation_failed')
    const after = getJob(job.id)!
    expect(after.state).toBe('failed')
    expect(after.code).toBe('generation_failed')
    expect(after.error).toBe('Video generation timeout')
  })
})
