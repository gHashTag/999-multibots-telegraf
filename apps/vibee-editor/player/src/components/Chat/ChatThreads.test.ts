import { describe, expect, it } from 'vitest'
import type { ClientRow } from '@/lib/crm'
import { CHAT_THREAD_LIMIT, threadClients, threadLabel } from './ChatThreads'

/**
 * Which conversations the row offers: the agent's own is always first (drawn
 * by the component); of the clients, the most recently seen, with the open one
 * kept even when it is not recent.
 */
const row = (
  id: string,
  lastSeen: string | null,
  over: Partial<ClientRow> = {}
): ClientRow => ({
  telegramId: id,
  name: null,
  username: null,
  client: null,
  hasProfile: false,
  hasSoul: false,
  skills: 0,
  stage: 'new',
  paid: false,
  lastSeen,
  duets: 0,
  // No stored picture: the rail draws initials for such a row.
  avatarUrl: null,
  ...over,
})

describe('the row of conversations', () => {
  it('puts the most recently seen clients first', () => {
    const shown = threadClients(
      [
        row('100001', '2026-09-20T00:00:00Z'),
        row('100002', '2026-09-22T00:00:00Z'),
        row('100003', null),
      ],
      null
    )
    expect(shown.map(r => r.telegramId)).toEqual(['100002', '100001', '100003'])
  })

  it('offers at most the limit, and keeps the open thread even when it is old', () => {
    const many = Array.from({ length: CHAT_THREAD_LIMIT + 5 }, (_, i) =>
      row(String(200000 + i), new Date(Date.UTC(2026, 8, 1 + i)).toISOString())
    )
    const oldest = '200000'
    const shown = threadClients(many, oldest)
    expect(shown).toHaveLength(CHAT_THREAD_LIMIT + 1)
    expect(shown[0].telegramId).toBe(oldest)
  })

  it('drops rows whose id could not open a thread', () => {
    expect(
      threadClients(
        [row('abc', null), row('', null), row('300001', null)],
        null
      ).map(r => r.telegramId)
    ).toEqual(['300001'])
  })

  it('names a client by name, then @username, then id', () => {
    expect(
      threadLabel(row('1', null, { name: ' Алекс ', username: 'alex' }))
    ).toBe('Алекс')
    expect(threadLabel(row('1', null, { username: 'alex' }))).toBe('@alex')
    expect(threadLabel(row('123456', null))).toBe('123456')
  })
})
