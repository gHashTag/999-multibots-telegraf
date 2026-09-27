/**
 * THE END LINE ON EVERY EXIT (loop turn 7, 27.09.2026).
 *
 * The owner's catalogue acceptance ran five agents one after another; the
 * render's log held five `[agent:turn] start` lines and not one `end`. The
 * turn wrote its end line only where it returned by itself -- a caller that
 * stopped reading, or a throw, left none. withTurnEnd writes it for them.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withTurnEnd, type TurnEnd, type TurnOutcome } from './src/agent/chat'

function recorder() {
  const lines: Array<{ outcome: TurnOutcome; details?: string }> = []
  const end: TurnEnd = { logged: false }
  end.log = (outcome, details) => {
    end.logged = true
    lines.push({ outcome, details })
  }
  return { end, lines }
}

describe('the turn writes one end line on every exit', () => {
  it('a turn that ends by itself is not written twice', async () => {
    const { end, lines } = recorder()
    async function* turn() {
      yield 'text'
      end.log!('ok')
      yield 'done'
    }
    const seen: string[] = []
    for await (const e of withTurnEnd(turn(), end)) seen.push(e)
    expect(seen).toEqual(['text', 'done'])
    expect(lines).toEqual([{ outcome: 'ok', details: undefined }])
  })

  it('a caller that stops reading gets an aborted line', async () => {
    const { end, lines } = recorder()
    async function* turn() {
      yield 'text'
      yield 'more'
      end.log!('ok')
    }
    for await (const e of withTurnEnd(turn(), end)) if (e === 'text') break
    expect(lines).toEqual([
      {
        outcome: 'aborted',
        details: 'the caller stopped reading before the turn ended',
      },
    ])
  })

  it('a turn that throws gets an error line, and the throw goes on', async () => {
    const { end, lines } = recorder()
    async function* turn(): AsyncGenerator<string> {
      yield 'text'
      throw new Error('provider went away')
    }
    await expect(async () => {
      for await (const _ of withTurnEnd(turn(), end)) void _
    }).rejects.toThrow('provider went away')
    expect(lines).toEqual([{ outcome: 'error', details: 'provider went away' }])
  })

  it('runAgent is the wrapped turn, and the turn marks its own end line', () => {
    const src = readFileSync(join(__dirname, 'src', 'agent', 'chat.ts'), 'utf8')
    expect(src).toContain(
      'return yield* withTurnEnd(runAgentTurn(history, ctx, opts, end), end)'
    )
    const logger = src.slice(src.indexOf('const logTurnEnd = '))
    expect(logger.slice(0, 200)).toContain('end.logged = true')
    expect(src).toContain('  end.log = logTurnEnd\n')
  })
})
