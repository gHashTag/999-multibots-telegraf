import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ONE UPGRADE DISPATCHER ON THE PORT, OR TWO OUTAGES.
 *
 * `new WebSocketServer({ server })` attaches the library's OWN 'upgrade'
 * listener and takes every upgrade on the port. The person's browser attached
 * a second. Both fired on every connection:
 *
 *   /live/  -> the sync server answered 101 + {"type":"connected"}, then the
 *              browser proxy wrote a SECOND "HTTP/1.1 101" into the open
 *              socket. Captured raw: frame 1's payload was the literal text
 *              "TP/1.1 101 Switching Protocols". The picture never started.
 *   /       -> the sync server accepted it, the browser proxy refused it and
 *              wrote "HTTP/1.1 404" into the same socket. The editor's live
 *              sync died after one message, for every user.
 *
 * This reads the file on purpose: the defect is structural -- how many
 * listeners are attached -- and render-server.ts cannot be imported into a
 * test without starting the whole service.
 */
const src = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the WebSocket port has exactly one owner per connection', () => {
  it('ATTACHES EXACTLY ONE upgrade listener', () => {
    const listeners = code.match(/\.on\(\s*['"]upgrade['"]/g) || []
    expect(listeners.length).toBe(1)
  })

  it('never lets the sync server attach its own', () => {
    const block = code.match(/new WebSocketServer\(\{([\s\S]*?)\}\)/)
    expect(block, 'no WebSocketServer found').toBeTruthy()
    expect(block![1]).toMatch(/noServer:\s*true/)
    /* `server,` or `server:` inside is exactly the bug. */
    expect(block![1]).not.toMatch(/(^|[\s,{])server\s*[,:}]/)
  })

  it('hands everything that is not the browser to the sync server', () => {
    /* Refusing it instead is what killed the editor's live sync. */
    expect(code).toMatch(/wss\.handleUpgrade\(/)
  })
})
