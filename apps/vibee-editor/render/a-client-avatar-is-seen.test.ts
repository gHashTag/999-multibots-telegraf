import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  TOOLS,
  profilePhotoViaSession,
  type ToolContext,
} from './src/agent/tools'

/**
 * A CLIENT WITH A VISIBLE AVATAR IS NEVER TOLD HE HAS NONE.
 *
 * Production 2026-09-22: the lead magnet told the owner "no avatar, no photo"
 * about a client whose avatar the owner sees in his own chat list, and the
 * agent told that client in a business DM that he had no profile photo.
 * Two causes: every tool call opens a new Telegram client with an empty
 * entity cache, so a bare id could not be resolved without warming it; and
 * whoami read only the app profile (empty until the person opens the app)
 * and handed the model the sentence "Фото профиля нет". Ids are invented.
 */

function coldClient(photo: Buffer) {
  let warm = false
  const calls: string[] = []
  return {
    calls,
    async getDialogs() {
      calls.push('getDialogs')
      warm = true
      return []
    },
    async downloadProfilePhoto(target: string) {
      calls.push(`download ${target}`)
      if (!warm && /^\d+$/.test(target))
        throw new Error(
          'Could not find the input entity for {"userId":"900000048"}'
        )
      return photo
    },
  }
}

describe('profilePhotoViaSession', () => {
  it('a bare id on a fresh client: the dialogs are loaded once and the photo is found', async () => {
    const photo = Buffer.from('jpeg')
    const c = coldClient(photo)
    const got = await profilePhotoViaSession(c, { id: '900000048' })
    expect(got).toBe(photo)
    expect(c.calls).toEqual([
      'download 900000048',
      'getDialogs',
      'download 900000048',
    ])
  })

  it('a @username resolves at once, with no warm-up', async () => {
    const c = coldClient(Buffer.from('jpeg'))
    await profilePhotoViaSession(c, {
      id: '900000048',
      username: 'placeholder_client',
    })
    expect(c.calls).toEqual(['download @placeholder_client'])
  })
})

describe('whoami without an app avatar', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
    vi.unstubAllGlobals()
  })

  it('asks Telegram, and never hands the model "no profile photo" as a fact', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'not-a-real-token' // secret-guard-ok: invented value, fetch is stubbed
    process.env.SUPABASE_URL = 'https://supabase.example.invalid'
    process.env.SUPABASE_SERVICE_KEY = 'key'
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(String(url))
      const body = /getUserProfilePhotos/.test(String(url))
        ? { ok: true, result: { total_count: 0, photos: [] } }
        : []
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        if (/FROM users u/.test(sql))
          return {
            rows: [
              {
                telegram_id: params[0],
                username: '',
                first_name: 'Client',
                avatar_url: '',
                display_name: '',
              },
            ],
          }
        if (/FROM public_templates/.test(sql)) return { rows: [{ n: 0 }] }
        return { rows: [] }
      },
    }
    const whoami = TOOLS.find(t => t.name === 'whoami')!
    const out = (await whoami.handler({}, {
      telegramId: '900000048',
      pool,
    } as unknown as ToolContext)) as Record<string, unknown>
    expect(
      asked.some(u => /getUserProfilePhotos\?user_id=900000048/.test(u))
    ).toBe(true)
    const hint = String(out['подсказкаПроАватар']) // cyrillic-ok: the tool's own field name
    expect(hint).not.toContain('Фото профиля нет') // cyrillic-ok: the sentence that must be gone
    expect(hint).toContain('НЕ говори') // cyrillic-ok: the instruction that replaced it
  })
})
