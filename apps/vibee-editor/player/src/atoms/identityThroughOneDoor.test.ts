/**
 * SCREENS SIGN IN THROUGH THE ONE DOOR.
 *
 * 2026-09-22: the owner, signed in on the website, pressed "Save and continue"
 * on the twin form and got "a Telegram signature or an agent key is
 * required". The screen built its own headers -- signature or dev key, never
 * the app session -- so in a browser it sent no identity at all. Two more
 * screens did the same. lib/apiFetch authHeaders is the one door: the
 * signature alone when there is one, the session when there is not.
 *
 * Ids are invented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createStore } from 'jotai'

const who = { initData: '', token: '' }
vi.mock('../lib/telegram', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getInitData: () => who.initData,
  getTelegramUser: () => ({ id: 900000061, first_name: 'P' }),
}))
vi.mock('../lib/appSession', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAppAccessToken: () => who.token,
}))

let sent: Headers[] = []
beforeEach(() => {
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent.push(new Headers(init?.headers))
      return new Response(JSON.stringify({ result: {} }), { status: 200 })
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

const screens: Array<
  [string, (s: ReturnType<typeof createStore>) => Promise<unknown>]
> = [
  ['soul', async s => s.set((await import('./soul')).loadSoulAtom)],
  [
    'avatar photos',
    async s => s.set((await import('./avatarPhotos')).loadAvatarPhotosAtom),
  ],
  [
    'bot assets',
    async s => {
      const { userAtom } = await import('./user')
      s.set(userAtom as never, { telegram_id: '900000061' } as never)
      return s.set((await import('./botAssets')).loadBotAssetsAtom)
    },
  ],
]

describe('in a browser, signed in: the app session goes', () => {
  for (const [name, load] of screens) {
    it(name, async () => {
      who.initData = ''
      who.token = 'session-900000061' // secret-guard-ok: invented test value, not a credential
      await load(createStore())
      expect(sent.length, `${name} made no request`).toBeGreaterThan(0)
      expect(sent[0].get('Authorization')).toBe('Bearer session-900000061')
      expect(sent[0].has('X-Telegram-Init-Data')).toBe(false)
    })
  }
})

describe('inside Telegram: the signature goes ALONE', () => {
  for (const [name, load] of screens) {
    it(name, async () => {
      who.initData = 'signed'
      who.token = 'session-900000061' // secret-guard-ok: invented test value, not a credential
      await load(createStore())
      expect(sent[0].get('X-Telegram-Init-Data')).toBe('signed')
      expect(sent[0].has('Authorization')).toBe(false)
    })
  }
})

describe('no screen builds identity headers by hand', () => {
  const SRC = path.resolve(__dirname, '..')
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name))
        files.push(p)
    }
  }
  walk(SRC)
  it('only lib/apiFetch.ts sets the signature header', () => {
    const offenders = files
      .filter(f => !f.endsWith(path.join('lib', 'apiFetch.ts')))
      .filter(f => {
        const code = fs
          .readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        return /\.set\(\s*['"]X-Telegram-Init-Data['"]|['"]X-Telegram-Init-Data['"]\s*:/.test(
          code
        )
      })
      .map(f => path.relative(SRC, f))
    expect(offenders).toEqual([])
  })
})
