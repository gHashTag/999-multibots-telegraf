import { describe, it, expect } from 'vitest'
import { hangUp } from './src/agent/hang-up'
import { withClient } from './src/agent/telegram-tools'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/**
 * HANG UP = destroy(), NOT disconnect().
 *
 * Measured 2026-09-13 on vibee-render: ~21 `Error: TIMEOUT` a minute from
 * telegram/client/updates.js hours after the last tool call. gramjs 2.26
 * runs its ping loop `while (!client._destroyed)`; disconnect() closes the
 * socket and leaves the flag false, so the loop pings a dead sender every
 * nine seconds, logs the timeout and reconnects. destroy() sets the flag.
 */
describe('hangUp', () => {
  it('prefers destroy() when the client has it', async () => {
    const calls: string[] = []
    await hangUp({
      destroy: async () => void calls.push('destroy'),
      disconnect: async () => void calls.push('disconnect'),
    })
    expect(calls).toEqual(['destroy'])
  })

  it('falls back to disconnect() for a client (or a fake) without destroy', async () => {
    const calls: string[] = []
    await hangUp({ disconnect: async () => void calls.push('disconnect') })
    expect(calls).toEqual(['disconnect'])
  })

  it('a broken hang-up, a missing client, a client with neither: all silent', async () => {
    await expect(
      hangUp({
        destroy: async () => {
          throw new Error('socket gone')
        },
      })
    ).resolves.toBeUndefined()
    await expect(hangUp(null)).resolves.toBeUndefined()
    await expect(hangUp({})).resolves.toBeUndefined()
  })

  it('gramjs in node_modules really needs it: destroy() exists and disconnect() does not set _destroyed', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(
        require.resolve('telegram/client/telegramBaseClient.js'),
        'utf8'
      )
    )
    const upd = await import('node:fs').then(fs =>
      fs.readFileSync(require.resolve('telegram/client/updates.js'), 'utf8')
    )
    expect(upd).toContain('while (!client._destroyed)')
    // If gramjs renames destroy(), a bare slice(indexOf(...)) yields the
    // file's last character and this reads as a vendor change nobody noticed.
    const destroyBody = sliceFrom(src, 'async destroy()', 200)
    expect(destroyBody).toContain('this._destroyed = true')
    const disconnectBody = src.slice(
      src.indexOf('async disconnect()'),
      src.indexOf('get disconnected()')
    )
    expect(disconnectBody).not.toContain('_destroyed')
  })
})

describe('withClient hangs up with destroy()', () => {
  it('every reading tool goes through withClient, and withClient destroys', async () => {
    const fs = await import('node:fs')
    // Read through THIS file's URL, not the process cwd: `vitest related`
    // from the repo root (the pre-push gate) runs with cwd at the root,
    // where src/agent/telegram-tools.ts does not exist.
    const agent = new URL('./src/agent/', import.meta.url)
    const s = fs.readFileSync(new URL('telegram-tools.ts', agent), 'utf8')
    const body = s.slice(
      s.indexOf('export async function withClient'),
      s.indexOf('export interface СыройДиалог') // cyrillic-ok: pre-existing identifier
    )
    /*
     * WHAT IS LEFT FOR THE SOURCE TO SAY.
     *
     * That hanging up happens in a `finally` is now checked by CALLING it --
     * see the describe at the bottom of this file, where a throwing body
     * still hangs up and a mutation turning the `finally` into a sequential
     * call is killed. The old line here could not see that: it matched
     * characters that survive exactly that change.
     *
     * These two remain because only the text can show them: the wrapper
     * delegates rather than growing a second copy of the rule, and nobody in
     * the agent reaches past hangUp to a bare disconnect.
     */
    expect(body).toContain('withClientOf(')
    expect(body).not.toContain('c.disconnect()')
    // And nobody in the agent reaches past hangUp to a bare disconnect().
    for (const f of [
      'tg-proposals.ts',
      'crm-memory-tools.ts',
      'crm-offer-tool.ts',
      'tg-connect.ts',
    ]) {
      const t = fs.readFileSync(new URL(f, agent), 'utf8')
      expect(t, f).not.toMatch(/\.disconnect\?\.\(\)|await c\.disconnect\(\)/)
      expect(t, f).toContain('hangUp(')
    }
    void withClient
  })
})

/*
 * THE PROMISE IS NOW RUN INSTEAD OF READ.
 *
 * Every reading tool goes through withClient, and a client left connected is
 * a zombie update loop pinging Telegram for the life of the process --
 * twenty-one timeout lines a minute, measured on 13.09.2026, hours after the
 * last tool call had returned.
 *
 * The guard on that used to be a test matching the words `await hangUp(c)` in
 * the source. It would go red on a renamed variable and stay SILENT if the
 * `finally` became a plain `then` -- the one change that actually brings the
 * zombies back.
 */
describe('withClient hangs up whatever happens inside', () => {
  const fake = () => {
    const calls: string[] = []
    const c = {
      destroy: async () => {
        calls.push('destroy')
      },
      disconnect: async () => {
        calls.push('disconnect')
      },
    }
    return { c, calls }
  }

  it('hangs up after a normal return', async () => {
    const { withClientOf } = await import('./src/agent/telegram-tools')
    const { c, calls } = fake()
    const out = await withClientOf(
      async () => c as never,
      async () => 'готово'
    )
    expect(out).toBe('готово')
    expect(calls).toEqual(['destroy'])
  })

  /*
   * The case the whole thing exists for. A tool that throws is the normal way
   * a call ends when Telegram refuses, and that is exactly when a leaked
   * client is never noticed.
   */
  it('hangs up when the body throws, and lets the error through', async () => {
    const { withClientOf } = await import('./src/agent/telegram-tools')
    const { c, calls } = fake()
    await expect(
      withClientOf(
        async () => c as never,
        async () => {
          throw new Error('телеграм отказал')
        }
      )
    ).rejects.toThrow('телеграм отказал')
    expect(calls, 'клиент остался подключённым после ошибки').toEqual([
      'destroy',
    ])
  })

  it('destroy, not disconnect: disconnect leaves the update loop alive', async () => {
    const { withClientOf } = await import('./src/agent/telegram-tools')
    const { c, calls } = fake()
    await withClientOf(
      async () => c as never,
      async () => null
    )
    expect(calls).not.toContain('disconnect')
  })
})
