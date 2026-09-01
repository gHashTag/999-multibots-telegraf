import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import {
  handleAuthRouteSafely,
  syncVerifiedWidgetProfile,
} from './session-routes'

type ProfileRow = {
  telegram_id: string
  username: string | null
  telegram_auth_date: number
  display_name?: string
  avatar_url?: string | null
}

function concurrentProfilePool() {
  const profiles: ProfileRow[] = []
  const lockTails = new Map<string, Promise<void>>()

  const connect = async () => {
    const releases: Array<() => void> = []
    const acquire = async (key: string) => {
      const previous = lockTails.get(key) || Promise.resolve()
      let release!: () => void
      const held = new Promise<void>(resolve => {
        release = resolve
      })
      const tail = previous.then(() => held)
      lockTails.set(key, tail)
      await previous
      releases.push(() => {
        release()
        if (lockTails.get(key) === tail) lockTails.delete(key)
      })
    }

    return {
      release() {},
      async query(sql: string, params: unknown[] = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim()
        if (normalized === 'BEGIN') return { rows: [] }
        if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
          while (releases.length) releases.pop()?.()
          return { rows: [] }
        }
        if (
          normalized.startsWith('CREATE ') ||
          normalized.startsWith('ALTER ') ||
          normalized.startsWith('DELETE FROM profiles') ||
          normalized.startsWith('WITH ranked AS')
        ) {
          return { rows: [] }
        }
        if (normalized.startsWith('SELECT pg_advisory_xact_lock')) {
          const prefix = normalized.includes("'username:'") ? 'u:' : 't:'
          await acquire(prefix + String(params[0]).toLowerCase())
          return { rows: [] }
        }
        if (
          normalized.startsWith(
            'SELECT telegram_id, username, telegram_auth_date'
          )
        ) {
          return {
            rows: profiles.filter(
              row =>
                row.telegram_id === String(params[0]) ||
                (!!params[1] &&
                  String(row.username || '').toLowerCase() ===
                    String(params[1]).toLowerCase())
            ),
          }
        }
        if (normalized.startsWith('UPDATE profiles SET username = NULL')) {
          for (const row of profiles) {
            if (
              String(row.username || '').toLowerCase() ===
                String(params[0]).toLowerCase() &&
              row.telegram_id !== String(params[1])
            ) {
              row.username = null
            }
          }
          return { rows: [] }
        }
        if (normalized.startsWith('UPDATE users SET username = NULL')) {
          return { rows: [] }
        }
        if (normalized.startsWith('UPDATE users SET username = $2')) {
          return { rows: [{ id: params[0] }] }
        }
        if (normalized.startsWith('INSERT INTO profiles')) {
          const incoming = Number(params[4])
          let row = profiles.find(
            candidate => candidate.telegram_id === String(params[0])
          )
          if (row && row.telegram_auth_date > incoming) return { rows: [] }
          if (!row) {
            row = {
              telegram_id: String(params[0]),
              username: null,
              telegram_auth_date: 0,
            }
            profiles.push(row)
          }
          row.username = params[1] ? String(params[1]) : null
          row.display_name = String(params[2])
          row.avatar_url = params[3] ? String(params[3]) : row.avatar_url
          row.telegram_auth_date = incoming
          return { rows: [{ telegram_id: row.telegram_id }] }
        }
        throw new Error(`unexpected profile query: ${normalized.slice(0, 90)}`)
      },
    }
  }

  return {
    profiles,
    connect,
    query: async () => ({ rows: [] }),
  }
}

describe('Login Widget profile ownership', () => {
  it('serializes two owners and refuses a replay from the previous owner', async () => {
    const pool = concurrentProfilePool()
    const common = {
      first_name: 'Owner',
      username: 't27_dev',
    }

    await Promise.all([
      syncVerifiedWidgetProfile(pool as any, {
        ...common,
        id: 101,
        auth_date: 1_000,
      }),
      syncVerifiedWidgetProfile(pool as any, {
        ...common,
        id: 202,
        auth_date: 1_001,
      }),
    ])

    expect(
      pool.profiles.filter(row => row.username?.toLowerCase() === 't27_dev')
    ).toEqual([
      expect.objectContaining({
        telegram_id: '202',
        telegram_auth_date: 1_001,
      }),
    ])

    await expect(
      syncVerifiedWidgetProfile(pool as any, {
        ...common,
        id: 101,
        auth_date: 1_000,
      })
    ).rejects.toThrow('stale Telegram profile assertion')
  })
})

describe('auth HTTP error boundary', () => {
  it('returns a constant redacted 503 when profile storage fails', async () => {
    const botToken = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const widget = {
      id: 303,
      first_name: 'Owner',
      username: 'owner_303',
      auth_date: Math.floor(Date.now() / 1000),
    }
    const check = Object.entries(widget)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('\n')
    const hmacKey = crypto.createHash('sha256').update(botToken).digest()
    const body = {
      ...widget,
      hash: crypto.createHmac('sha256', hmacKey).update(check).digest('hex'),
    }
    process.env.BOT_TOKEN_12 = botToken
    process.env.SESSION_SIGNING_KEY = 'x'.repeat(48)
    const request = Readable.from([Buffer.from(JSON.stringify(body))]) as any
    request.url = '/api/auth/widget'
    request.method = 'POST'
    request.headers = {}
    const response: any = {
      headersSent: false,
      status: 0,
      body: '',
      writeHead(status: number) {
        this.status = status
        this.headersSent = true
      },
      end(body: string) {
        this.body = body
      },
      destroy: vi.fn(),
    }
    const sensitiveMarker = ['database', 'must', 'not', 'escape'].join('-')
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => {
        throw new Error(sensitiveMarker)
      },
    }
    const handled = await handleAuthRouteSafely(
      request,
      response,
      () => pool as any
    )

    expect(handled).toBe(true)
    expect(response.status).toBe(503)
    expect(response.body).toContain('authentication service unavailable')
    expect(response.body).not.toContain(sensitiveMarker)
    expect(response.destroy).not.toHaveBeenCalled()
  })
})
