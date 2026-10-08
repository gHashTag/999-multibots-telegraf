import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * ONE MEMORY ACROSS THE THREADS OF THE PRIVATE CHAT (spec bot-agent-memory.t27).
 *
 * Owner, 2026-10-08: "the session must keep every exchange with the client --
 * now it resets and starts over, this is a bug". Each Telegram thread had its
 * own memory, keyed by thread id, and a message outside the tabs opens a new
 * thread -- so it started from nothing. The rule itself is tested in
 * src/spec/bot-agent-memory.test.ts; this pins that every door of the bot that
 * talks to the agent goes through it.
 */
const src = readFileSync(
  join(__dirname, '../../navigation/registerCommands.ts'),
  'utf8'
)

describe('every agent door in the bot asks memory.ts which conversation', () => {
  it('a typed turn in the private chat', () => {
    const at = src.indexOf('const inRoom =')
    const call = src.indexOf('спроситьАгента(', at) // cyrillic-ok: pre-existing identifier
    const body = src.slice(at, call)
    expect(body).toContain('await agentConversationIn(ctx)')
  })

  it('a press answered by the agent (runAgentTurnFor)', () => {
    const at = src.indexOf('async function runAgentTurnFor(')
    expect(at).toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf('\n}\n', at))
    expect(body).toContain('await agentConversationIn(ctx)')
    expect(body).toContain('conversation ? { conversation } : {}')
  })

  it('a recorded fallback line goes where its turn was asked', () => {
    const records = src.split('void recordTurns(').slice(1)
    expect(records.length).toBeGreaterThanOrEqual(2)
    for (const r of records) {
      expect(r.slice(0, r.indexOf('\n        )'))).toContain('turnWhere')
    }
  })

  it('no memory is keyed by a thread id any more', () => {
    expect(src).not.toContain('agentConversationFor')
    expect(src).not.toMatch(/`topic\$\{/)
  })
})
