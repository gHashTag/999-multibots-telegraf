/**
 * A STEP THAT CANNOT TELL WHEN IT IS DONE ASKS FOREVER.
 *
 * The welcome road decides where to start from server facts. Club membership
 * and the Telegram connection each have a status route; the voice had none, so
 * the mini app could not have a step for it at all -- which is why two finished
 * pieces of the digital clone sat unreachable while the owner asked for them.
 *
 * Driven through the real handler with a pool double that answers rows; nothing
 * here reads the source.
 */
import { describe, it, expect } from 'vitest'
import {
  handleClone,
  isClonePath,
  present,
  type CloneDeps,
} from './src/agent/clone-readiness'

const OWNER = '144022504'

/** A pool that answers one row, and records what it was asked. */
const poolWith = (row: Record<string, unknown> | null) => {
  const asked: Array<{ sql: string; params?: unknown[] }> = []
  return {
    asked,
    pool: {
      query: async (sql: string, params?: unknown[]) => {
        asked.push({ sql, params })
        return { rows: row ? [row] : [] }
      },
    },
  }
}

const deps = (
  row: Record<string, unknown> | null,
  who: string | null = OWNER
): CloneDeps & { asked: Array<{ sql: string; params?: unknown[] }> } => {
  const { pool, asked } = poolWith(row)
  return { getPool: async () => pool, identity: () => who, asked }
}

const get = (url = '/api/clone/status') => ({ url, method: 'GET' })

describe('which pieces of the clone exist', () => {
  it('reports a voice stored under the name the bot actually writes', async () => {
    const d = deps({ voice_id_elevenlabs: 'v_abc123', photo_url: null })
    const r = await handleClone(get(), d)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, voice: true, photo: false })
  })

  /*
   * TWO COLUMN NAMES FOR ONE THING. updateUserVoice.ts writes
   * `voice_id_elevenlabs`; newer code says `voice_id`. Somebody whose voice
   * exists must not be asked to record it again because it was filed under the
   * name this route did not know.
   */
  it('accepts either column name for the voice', async () => {
    const older = await handleClone(get(), deps({ voice_id_elevenlabs: 'v1' }))
    const newer = await handleClone(get(), deps({ voice_id: 'v1' }))
    expect(older.body).toMatchObject({ voice: true })
    expect(newer.body).toMatchObject({ voice: true })
  })

  it('reports the avatar stored at registration', async () => {
    const r = await handleClone(
      get(),
      deps({ photo_url: 'https://example.test/a.jpg' })
    )
    expect(r.body).toMatchObject({ voice: false, photo: true })
  })

  /*
   * A person the app knows and the users table does not has simply not been
   * created yet. That is not an error, and answering 500 would stop the
   * welcome dead on its first screen.
   */
  it('says everything is absent for a person with no row yet', async () => {
    const r = await handleClone(get(), deps(null))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, voice: false, photo: false })
  })

  it('never returns the voice identifier itself', async () => {
    const r = await handleClone(
      get(),
      deps({ voice_id_elevenlabs: 'v_secret_handle', photo_url: 'x' })
    )
    expect(JSON.stringify(r.body)).not.toContain('v_secret_handle')
  })

  it('asks about the person who asked, and nobody else', async () => {
    const d = deps({ voice_id_elevenlabs: 'v1' })
    await handleClone(get(), d)
    expect(d.asked).toHaveLength(1)
    expect(d.asked[0].params).toEqual([OWNER])
  })
})

describe('who may ask', () => {
  /*
   * Unlike the club's price, this answer is about one person. An anonymous
   * `false` would be worse than a refusal: the welcome would read it as a fact
   * and ask a signed-out visitor to redo work they may already have done.
   */
  it('refuses without an identity instead of guessing false', async () => {
    const r = await handleClone(get(), deps({ voice_id: 'v1' }, null))
    expect(r.status).toBe(401)
    expect(r.body.ok).toBe(false)
    expect(r.body).not.toHaveProperty('voice')
  })

  it('refuses a chat, because a clone belongs to a person', async () => {
    const r = await handleClone(get(), deps({ voice_id: 'v1' }, '-100123'))
    expect(r.status).toBe(400)
  })

  it('takes GET only', async () => {
    const r = await handleClone(
      { url: '/api/clone/status', method: 'POST' },
      deps({ voice_id: 'v1' })
    )
    expect(r.status).toBe(405)
  })
})

describe('when the database is the thing that failed', () => {
  /*
   * "Unknown" and "empty" are different answers, and only one of them sends
   * somebody to redo work. A 503 lets the caller keep the picture it has.
   */
  it('says unknown rather than empty', async () => {
    const r = await handleClone(get(), {
      getPool: async () => ({
        query: async () => {
          throw new Error('connection terminated')
        },
      }),
      identity: () => OWNER,
    })
    expect(r.status).toBe(503)
    expect(r.body.ok).toBe(false)
    expect(r.body).not.toHaveProperty('voice')
  })
})

describe('present', () => {
  it('treats blank, whitespace and the word null as absent', () => {
    expect(present('v1')).toBe(true)
    expect(present('')).toBe(false)
    expect(present('   ')).toBe(false)
    expect(present(null)).toBe(false)
    expect(present(undefined)).toBe(false)
    // What a column written by a script that interpolated a missing value
    // looks like. A clone is not ready because somebody wrote four letters.
    expect(present('null')).toBe(false)
    expect(present('undefined')).toBe(false)
  })
})

describe('the path', () => {
  it('claims its own route and nothing near it', () => {
    expect(isClonePath('/api/clone/status')).toBe(true)
    expect(isClonePath('/api/clone/status/extra')).toBe(false)
    expect(isClonePath('/api/clone')).toBe(false)
    expect(isClonePath('/api/club/status')).toBe(false)
  })
})
