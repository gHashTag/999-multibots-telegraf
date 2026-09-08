import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * WHAT THE PERSON SAW MUST REACH THE OWNER.
 *
 * 08.09.2026, 17:28Z: the agent chat showed "Network unavailable: TypeError:
 * Load failed" twice while the render container was being replaced. No server
 * saw the request, so no alert existed; the owner learned about it as a
 * customer ("a user's thing broke and I did not know").
 *
 * Pins (structural): the beacon exists and queues when the server is down; the
 * agent stream retries a network drop ONCE before any text and reports the
 * final failure; a failed upload reports; the app installs the global handlers
 * at start. Mutation-checked.
 */
const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

describe('client errors reach the owner', () => {
  const beacon = read('lib/clientErrorBeacon.ts')
  const stream = read('lib/agentStream.ts')
  const upload = read('lib/s3Upload.ts')
  const main = read('main.tsx')

  it('the beacon posts to /api/client-error, queues on failure, dedups per session', () => {
    expect(beacon).toContain('/api/client-error')
    expect(beacon).toContain('keepalive: true')
    expect(beacon).toMatch(/localStorage\.setItem\(\s*QUEUE_KEY/)
    expect(beacon).toContain('SESSION_DEDUP')
    expect(beacon).toMatch(/if \(!ok\) saveQueue\(\[\.\.\.queue\(\), body\]\)/)
  })

  it('the agent stream retries a network drop once before any text, then reports', () => {
    expect(stream).toContain('const MAX_ATTEMPTS = 2')
    expect(stream).toMatch(/const networkDrop = e instanceof TypeError/)
    expect(stream).toMatch(
      /if \(networkDrop && !receivedText && n < MAX_ATTEMPTS\)/
    )
    expect(stream).toContain("kind: 'agent_stream_failed'")
    expect(stream).not.toContain('Сеть недоступна:')
    const retry = stream.indexOf('повторяю…')
    const report = stream.indexOf("kind: 'agent_stream_failed'")
    expect(retry).toBeGreaterThan(-1)
    expect(report).toBeGreaterThan(retry)
  })

  it('a failed upload and uncaught errors report too', () => {
    expect(upload).toContain("kind: 'upload_failed'")
    expect(main).toContain('installGlobalClientErrorReporting()')
    expect(beacon).toContain("addEventListener('unhandledrejection'")
    expect(beacon).toContain("addEventListener('error'")
  })
})
