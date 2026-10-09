/**
 * ALL HER PROFILE PHOTOS, ONCE (crm-story-reel v31, AVATARS_MAX).
 *
 * The owner's storyboard showed one avatar three times. avatarHistory reads
 * the whole history through the seller's session (photos.GetUserPhotos),
 * puts each photo on our shelf, and remembers the list -- '[]' when there
 * is none, so the next open does not ask again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./telegram-tools', async orig => ({
  ...((await orig()) as object),
  withClient: async (_ctx: unknown, fn: (c: unknown) => unknown) =>
    fn(session.client),
}))
vi.mock('./tools', async orig => ({
  ...((await orig()) as object),
  publishImageBytes: async (_b: Buffer, _m: string, name: string) =>
    `https://shelf.example/${name}`,
}))

import { avatarHistory } from './crm-avatars'
import { profilePhotosViaSession } from './tools'

function db() {
  const writes: unknown[][] = []
  const pool = {
    query: async (sql: string, p: unknown[] = []) => {
      if (/UPDATE crm_people SET avatar_urls/.test(sql)) writes.push(p)
      return { rows: [] }
    },
  }
  return { pool, writes }
}

function fakeClient(photos: number) {
  const asked: Array<Record<string, unknown>> = []
  return {
    asked,
    getDialogs: async () => [],
    getInputEntity: async (t: string) => ({ resolved: t }),
    invoke: async (req: Record<string, unknown>) => {
      asked.push(req)
      return {
        photos: Array.from({ length: photos }, (_, i) => ({ id: i })),
      }
    },
    downloadMedia: async (p: { id: number }) => Buffer.from(`photo-${p.id}`),
  }
}

afterEach(() => {
  session.client = null
})

describe('every profile photo of a client', () => {
  it('asks Telegram for the history, newest first, bounded by the limit', async () => {
    const c = fakeClient(9)
    const got = await profilePhotosViaSession(c, { id: '900000011' }, 6)
    expect(got.map(b => b.toString())).toEqual([
      'photo-0',
      'photo-1',
      'photo-2',
      'photo-3',
      'photo-4',
      'photo-5',
    ])
    expect(c.asked[0]).toMatchObject({ limit: 6, offset: 0 })
  })

  it('puts each on our shelf and remembers the list on her row', async () => {
    session.client = fakeClient(3)
    const d = db()
    const urls = await avatarHistory(
      { telegramId: '900000010', pool: d.pool } as never,
      { id: '900000011', username: 'someone' },
      6
    )
    expect(urls).toHaveLength(3)
    expect(urls.every(u => u.startsWith('https://shelf.example/'))).toBe(true)
    expect(d.writes).toHaveLength(1)
    const [owner, lead, json, first] = d.writes[0] as string[]
    expect([owner, lead]).toEqual(['900000010', '900000011'])
    expect(JSON.parse(json)).toEqual(urls)
    expect(first).toBe(urls[0])
  })

  it('no photo at all is remembered as an empty list, so it is not asked again', async () => {
    session.client = fakeClient(0)
    const d = db()
    const urls = await avatarHistory(
      { telegramId: '900000010', pool: d.pool } as never,
      { id: '900000011' },
      6
    )
    expect(urls).toEqual([])
    expect(JSON.parse(String(d.writes[0][2]))).toEqual([])
  })
})
