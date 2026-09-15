import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { registerStopTurn } from '@/services/stopTurn'
import { stopTurn } from '@/services/trinityAgent'

/**
 * THE PERSON CAN END THE TURN THEY ARE WATCHING.
 *
 * Until 2026-09-16 nothing but a three-minute timer could end a turn -- not
 * the person, who often knows within seconds that it is going nowhere. One
 * press now ends the whole chain: the bot's request is aborted, which closes
 * the response from the render, which is how the agent learns to stop calling
 * tools.
 */
describe('the button is offered at all', () => {
  it('the draft asks Telegram to show a stop', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/helpers/streamDraft.ts'),
      'utf8'
    )
    expect(src).toContain('can_stop: true')
  })

  it('src/index.ts asks Telegram for the press', () => {
    // Not in the default set: an omission here is silent and permanent.
    const src = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
    const list = src.slice(src.indexOf('launchWithConflictRetry(bot'))
    expect(list.slice(0, 1600)).toContain("'stopped_message_generation'")
  })

  it('and the handler is registered on the bot', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toContain('registerStopTurn(bot)')
  })
})

describe('stopping a turn that is running', () => {
  it('reports nothing to stop when nobody is waiting', () => {
    expect(stopTurn('900000999')).toBe(false)
  })
})

describe('the press', () => {
  function fakeBot() {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>()
    const sent: Array<[string, string]> = []
    return {
      handlers,
      sent,
      on: (k: string, fn: (ctx: unknown) => Promise<void>) =>
        handlers.set(String(k), fn),
      telegram: {
        sendMessage: vi.fn(async (to: string, text: string) => {
          sent.push([String(to), String(text)])
          return true
        }),
      },
    }
  }
  const press = (chatId: number) => ({
    update: {
      stopped_message_generation: { chat: { id: chatId }, draft_id: 1 },
    },
  })

  beforeEach(() => vi.restoreAllMocks())

  it('registers itself under the key Telegram sends', () => {
    const b = fakeBot()
    registerStopTurn(b as never)
    expect(b.handlers.has('stopped_message_generation')).toBe(true)
  })

  it('says nothing when there was no turn to stop', async () => {
    // Otherwise a stale press would answer "stopped" about nothing at all.
    const b = fakeBot()
    registerStopTurn(b as never)
    await b.handlers.get('stopped_message_generation')!({
      ...press(900000998),
      telegram: b.telegram,
    })
    expect(b.sent).toHaveLength(0)
  })

  it('ignores an update with no chat in it', async () => {
    const b = fakeBot()
    registerStopTurn(b as never)
    await b.handlers.get('stopped_message_generation')!({
      update: { stopped_message_generation: {} },
      telegram: b.telegram,
    })
    expect(b.sent).toHaveLength(0)
  })
})
