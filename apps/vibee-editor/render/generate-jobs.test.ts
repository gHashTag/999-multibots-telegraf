import { describe, it, expect, beforeEach } from 'vitest'
import {
  startJob,
  finishJob,
  failJob,
  getJob,
  listJobs,
  _resetJobs,
  attachStore,
  getJobDurable,
  listJobsDurable,
} from './generate-jobs'

describe('generation jobs', () => {
  beforeEach(() => _resetJobs())

  it('records a result under the id handed out before the work started', () => {
    const job = startJob('video', '4242', 'a cat')
    expect(job.state).toBe('running')

    finishJob(job.id, 'https://storage/a.mp4', 'replicate/seedance')

    const found = getJob(job.id)
    expect(found?.state).toBe('done')
    expect(found?.url).toBe('https://storage/a.mp4')
    expect(found?.provider).toBe('replicate/seedance')
  })

  it('a failure is recorded too, not silently dropped', () => {
    const job = startJob('audio', '4242')
    failJob(job.id, 'ELEVENLABS_API_KEY holds an id, not a key')
    expect(getJob(job.id)?.state).toBe('failed')
    expect(getJob(job.id)?.error).toContain('ELEVENLABS')
  })

  /**
   * The test this file exists for.
   *
   * A prompt says what someone was trying to make and the url points at a file
   * they paid for. Both are personal. The naive filter — job.owner === owner —
   * matches every server-to-server job (owner '') against a caller with no
   * identity, handing one person's list to another.
   */
  it('never returns another account list, and an empty owner matches nothing', () => {
    const mine = startJob('video', '4242', 'mine')
    startJob('video', '9999', 'someone else')
    startJob('video', '', 'server to server')

    const forMe = listJobs('4242')
    expect(forMe.map(j => j.id)).toEqual([mine.id])

    // The dangerous case: no identity must not mean "everything".
    expect(listJobs('')).toEqual([])
  })

  it('newest first, so a lost result is the first thing seen', () => {
    const a = startJob('image', '4242', 'older')
    // startedAt comes from Date.now(); two calls in the same millisecond would
    // make the order arbitrary, so the older one is aged explicitly.
    const stored = getJob(a.id)!
    stored.startedAt -= 5000
    const b = startJob('image', '4242', 'newer')

    expect(listJobs('4242').map(j => j.id)).toEqual([b.id, a.id])
  })

  it('finishing an unknown id is ignored rather than throwing', () => {
    // A late callback for a swept job must not take the process down.
    expect(() => finishJob('no-such-id', 'https://x')).not.toThrow()
    expect(() => failJob('no-such-id', 'boom')).not.toThrow()
  })
})

describe('the JSON shape the native client decodes', () => {
  beforeEach(() => _resetJobs())

  /**
   * The iOS client decodes {id, kind, state, url, provider, error} and looks
   * for state === 'done'. Nothing in Swift can fail at compile time if a key
   * here is renamed -- the decode simply returns nil at runtime, on the exact
   * path that exists to rescue a paid generation. So the contract is asserted
   * here, where a rename does break something.
   */
  it('carries every key the client reads, spelled as it reads them', () => {
    const job = startJob('video', '4242', 'a cat')
    finishJob(job.id, 'https://storage/a.mp4', 'replicate/seedance')

    const wire = JSON.parse(JSON.stringify(getJob(job.id)))

    for (const key of ['id', 'kind', 'state', 'url', 'provider']) {
      expect(wire, `client reads "${key}"`).toHaveProperty(key)
    }
    // The literals the client compares against, not just the keys.
    expect(wire.state).toBe('done')
    expect(wire.kind).toBe('video')
  })

  it('the four kind names match what the client sends', () => {
    // The Swift side maps its own enum to these strings explicitly rather than
    // deriving them, so both sides must agree on the spelling.
    for (const kind of ['image', 'video', 'audio', 'lipsync'] as const) {
      const j = startJob(kind, '4242')
      expect(getJob(j.id)?.kind).toBe(kind)
    }
  })

  it('a running job carries no url, so the client cannot show an empty link', () => {
    const job = startJob('video', '4242')
    const wire = JSON.parse(JSON.stringify(getJob(job.id)))
    expect(wire.state).toBe('running')
    expect(wire.url).toBeUndefined()
  })
})

/**
 * HONEST STATUS OF THIS BLOCK.
 *
 * These pass, and they do NOT yet prove durability. Removing `persist(job)`
 * from `finishJob` — the single line that writes the finished state — leaves
 * all twelve green. Verified directly, not inferred.
 *
 * So the block currently proves that the read path works against a table that
 * happens to be populated, not that the write path populates it. The write is
 * fire-and-forget by design (a database round trip must not delay a
 * generation), and `await settle()` with one macrotask is evidently not the
 * right way to wait for it. Finding the right seam is the next step and is
 * deliberately not claimed here.
 *
 * Left in place rather than deleted: the read path and the empty-owner
 * refusal are genuinely covered, and a test that passes for a smaller reason
 * than its name suggests is worth keeping once the name says so.
 */
describe('durability: read path only, write-through NOT yet proven', () => {
  /**
   * A fake that throws on any statement it does not recognise. A fake
   * answering "0 rows" to a query it did not understand turns a broken test
   * into a passing one, which is worse than having no test.
   */
  function makePool() {
    const rows: any[] = []
    return {
      rows,
      calls: [] as string[],
      async query(sql: string, params: any[] = []) {
        const s = sql.replace(/\s+/g, ' ').trim()
        this.calls.push(s.slice(0, 40))
        if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) return { rows: [] }
        if (s.startsWith('INSERT INTO generate_jobs')) {
          const [id, kind, owner_id, state, started_at, finished_at, url, provider, error, prompt] = params
          const existing = rows.find(r => r.id === id)
          const row = { id, kind, owner_id, state, started_at, finished_at, url, provider, error, prompt }
          if (existing) Object.assign(existing, row)
          else rows.push(row)
          return { rows: [] }
        }
        if (s.startsWith('SELECT * FROM generate_jobs WHERE id')) {
          return { rows: rows.filter(r => r.id === params[0]) }
        }
        if (s.startsWith('SELECT * FROM generate_jobs WHERE owner_id')) {
          return { rows: rows.filter(r => r.owner_id === params[0]) }
        }
        throw new Error(`pool does not know: ${s.slice(0, 80)}`)
      },
    }
  }

  const settle = () => new Promise(r => setTimeout(r, 0))

  beforeEach(() => {
    _resetJobs()
    attachStore(null)
  })

  it('a finished job survives losing the in-memory index', async () => {
    const pool = makePool()
    attachStore(pool as any)

    const job = startJob('video', '4242', 'a cat')
    finishJob(job.id, 'https://storage/a.mp4', 'replicate')
    await settle()

    // Exactly what a deploy does.
    _resetJobs()

    const recovered = await getJobDurable(job.id)
    expect(recovered?.url).toBe('https://storage/a.mp4')
    expect(recovered?.state).toBe('done')
  })

  it('the list survives it too, and still refuses an empty owner', async () => {
    const pool = makePool()
    attachStore(pool as any)

    const mine = startJob('image', '4242', 'mine')
    finishJob(mine.id, 'https://storage/mine.png')
    startJob('image', '9999', 'theirs')
    await settle()
    _resetJobs()

    const list = await listJobsDurable('4242')
    expect(list.map(j => j.id)).toEqual([mine.id])
    expect(await listJobsDurable('')).toEqual([])
  })

  /**
   * The test that decides whether this design is right. Generation must not
   * depend on the index that merely finds it later.
   */
  it('a database that throws does not break starting or finishing a job', async () => {
    attachStore({
      async query() {
        throw new Error('database is on fire')
      },
    } as any)

    const job = startJob('video', '4242', 'a cat')
    expect(() => finishJob(job.id, 'https://storage/a.mp4')).not.toThrow()
    await settle()

    // Memory still has the truth; only durability was lost.
    expect(getJob(job.id)?.url).toBe('https://storage/a.mp4')
    expect(await getJobDurable(job.id)).toBeDefined()
  })

  it('memory wins over a stale row, so a finished job is never shown as running', async () => {
    const pool = makePool()
    attachStore(pool as any)

    const job = startJob('video', '4242')
    await settle()                       // the 'running' row is written
    finishJob(job.id, 'https://storage/a.mp4')
    // Deliberately NOT settling: the write-through is still in flight, which
    // is exactly the race someone hits when checking immediately.

    const list = await listJobsDurable('4242')
    expect(list[0].state).toBe('done')
  })
})
