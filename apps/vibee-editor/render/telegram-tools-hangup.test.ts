import { describe, it, expect } from 'vitest'
import { hangUp } from './src/agent/hang-up'
import { withClient } from './src/agent/telegram-tools'

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
    const destroyBody = src.slice(src.indexOf('async destroy()'))
    expect(destroyBody.slice(0, 200)).toContain('this._destroyed = true')
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
    expect(body).toContain('await hangUp(c)')
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
