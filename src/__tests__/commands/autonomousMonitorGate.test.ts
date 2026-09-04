import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * autonomousMonitor registers Telegram handlers that run commands on the
 * production server as root:
 *
 *   ssh -i ~/.ssh/zomro root@<host> '<command>'   via execSync
 *
 * so every handler it registers is a remote-execution surface, and the only
 * thing between a Telegram user and it is one isAdmin call per handler.
 *
 * Today all of them have it. That was established by reading all ten, which is
 * exactly the kind of check that is true until someone appends an eleventh
 * handler. Hence a test: the population is "handlers registered in this file",
 * and the property is "carries the gate".
 *
 * restart_cancel is the one exemption, listed by name rather than by pattern.
 * It answers the callback and edits the message to say the restart was
 * cancelled; it runs nothing and reaches no server. Exempting it by name means
 * a new ungated handler cannot inherit the exemption by accident.
 *
 * Two things checked by hand and recorded so they are not re-traced:
 *
 *   - No command injection. Every sshExec argument is built from module
 *     constants except one: the logs_ action does `parseInt(ctx.match[1])`
 *     before interpolating, so "50; rm -rf /" becomes 50 and a non-number
 *     becomes NaN, neither carrying a shell metacharacter.
 *   - The gate compares against ADMIN_TELEGRAM_ID, which in THIS file is a
 *     hardcoded literal rather than an environment read, unlike every other
 *     file of that name. That is written up for the owner: who may execute
 *     these commands is currently a decision configuration cannot reach.
 */

const ROOT = path.resolve(__dirname, '../../..')
const FILE = 'src/commands/autonomousMonitor.ts'
const source = fs.readFileSync(path.join(ROOT, FILE), 'utf8')

/** Handlers that run nothing and reach no server, named individually. */
const EXEMPT = new Set(['restart_cancel'])

/** Every bot.command / bot.action registration, with the body that follows. */
function handlers(): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = []
  const re = /bot\.(command|action)\(\s*(\/[^/]+\/[a-z]*|'[^']*'|"[^"]*")/g
  const starts: Array<{ name: string; at: number }> = []
  for (const m of source.matchAll(re)) {
    starts.push({ name: m[2].replace(/^['"]|['"]$/g, ''), at: m.index! })
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : source.length
    out.push({ name: starts[i].name, body: source.slice(starts[i].at, end) })
  }
  return out
}

describe('every autonomousMonitor handler is behind the admin gate', () => {
  it('finds the handlers at all', () => {
    // The control. A matcher that found nothing would make the check below
    // pass over an empty population, which reads exactly like success.
    const found = handlers()
    expect(found.length).toBeGreaterThanOrEqual(10)
    expect(found.map(h => h.name)).toContain('restart_confirm')
  })

  it('confirms the file really does execute remote commands', () => {
    // If this stops being true the test still passes but guards nothing that
    // matters, and the reason for its severity would be gone silently.
    expect(source).toContain('execSync')
    expect(source).toMatch(/ssh -i/)
  })

  it('gates every handler that is not an exempt no-op', () => {
    const ungated = handlers()
      .filter(h => !EXEMPT.has(h.name))
      .filter(h => !/isAdmin\(/.test(h.body))
      .map(h => h.name)
    expect(ungated).toEqual([])
  })

  it('keeps the exemption list honest', () => {
    // An exempt handler must stay a no-op: no sshExec, no execSync.
    for (const h of handlers().filter(x => EXEMPT.has(x.name))) {
      expect(h.body).not.toMatch(/sshExec\(|execSync\(/)
    }
  })
})
