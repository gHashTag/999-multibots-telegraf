import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The public render server must not leak raw internal error strings to clients.
 *
 * WHAT WAS WRONG. Five 500/502 catch blocks logged the error server-side
 * (console.error) — good — but ALSO returned `{ error: String(error) }` to the
 * client. On a public service that reveals internal details (DB errors, driver
 * messages, internal hostnames) to anyone who can trigger a 500.
 *
 * The fix returns a generic message per endpoint; the server-side console.error
 * keeps the detail for ops. This ratchet keeps the class closed: no response may
 * embed String(error) again.
 */
const SERVER = path.join(__dirname, 'render-server.ts')

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

describe('render server does not leak raw error strings to clients', () => {
  it('no response embeds error: String(error)', () => {
    const s = stripComments(fs.readFileSync(SERVER, 'utf8'))
    const hits = [...s.matchAll(/error:\s*String\(error\)/g)]
    expect(
      hits.length,
      `a response leaks the raw error string (String(error)) to the client ` +
        `in ${hits.length} place(s) — return a generic message and log the ` +
        `detail server-side instead`
    ).toBe(0)
  })
})
