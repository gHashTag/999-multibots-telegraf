/**
 * A story reel's poster (plan-reel.t27 v3): the frame drawn once by the
 * server, kept, swept, and never in the reel's way. The order against the
 * reel itself is held end to end in a-story-reel-for-any-client.test.ts
 * ("the reel's poster").
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as SPEC from '../spec/plan-reel.gen'
import {
  drawPoster,
  keepPoster,
  posterArgs,
  posterOf,
  posterState,
  sweepPosters,
  type PosterPort,
} from './reel-poster'

const REEL = 'https://bucket.example/reel.mp4'

/** An ffmpeg that writes `bytes` to its last argument, as the real one does. */
function port(bytes = 'jpeg', fail = false) {
  const runs: string[][] = []
  const puts: { name: string; mime: string; size: number }[] = []
  const p: PosterPort = {
    ffmpeg: async args => {
      runs.push(args)
      if (fail) throw new Error('ffmpeg exited 1: Invalid data')
      fs.writeFileSync(args[args.length - 1], bytes)
    },
    put: async (b, name, mime) => (
      puts.push({ name, mime, size: b.length }),
      { url: 'https://shelf.example/s3/poster.jpg' }
    ),
  }
  return { p, runs, puts }
}

describe('the frame the poster is', () => {
  it('is the preview frame, POSTER_W wide, one picture', () => {
    const a = posterArgs(REEL, '/tmp/x.jpg')
    expect(a[a.indexOf('-ss') + 1]).toBe(
      (SPEC.PREVIEW_SEEK_MS / 1000).toFixed(3)
    )
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'))
    expect(a[a.indexOf('-i') + 1]).toBe(REEL)
    expect(a[a.indexOf('-frames:v') + 1]).toBe('1')
    expect(a[a.indexOf('-vf') + 1]).toBe(`scale=${SPEC.POSTER_W}:-2`)
    expect(a.at(-1)).toBe('/tmp/x.jpg')
  })

  it('reads a stored column: NULL never tried, empty tried, a link kept', () => {
    expect(posterState(null)).toBe(SPEC.POSTER_NONE)
    expect(posterState(undefined)).toBe(SPEC.POSTER_NONE)
    expect(posterState('')).toBe(SPEC.POSTER_TRIED)
    expect(posterState('https://shelf.example/p.jpg')).toBe(SPEC.POSTER_KEPT)
    expect(posterOf('')).toBeUndefined()
    expect(posterOf(null)).toBeUndefined()
    expect(posterOf('https://shelf.example/p.jpg')).toBe(
      'https://shelf.example/p.jpg'
    )
  })
})

describe('drawing one poster', () => {
  it('puts the drawn frame on the shelf as a JPEG and answers its link', async () => {
    const { p, runs, puts } = port()
    expect(await drawPoster(p, REEL)).toBe(
      'https://shelf.example/s3/poster.jpg'
    )
    expect(runs).toHaveLength(1)
    expect(puts).toEqual([
      { name: 'reel-poster.jpg', mime: 'image/jpeg', size: 4 },
    ])
    expect(fs.existsSync(runs[0].at(-1)!)).toBe(false) // its folder is gone
  })

  it('answers null, never throws, when ffmpeg fails or draws nothing', async () => {
    expect(await drawPoster(port('', true).p, REEL)).toBeNull()
    const empty = port('')
    expect(await drawPoster(empty.p, REEL)).toBeNull()
    expect(empty.puts).toHaveLength(0)
  })

  it('never hands ffmpeg anything but a web address', async () => {
    const { p, runs } = port()
    for (const bad of ['/etc/passwd', 'file:///etc/passwd', '-i', ''])
      expect(await drawPoster(p, bad)).toBeNull()
    expect(runs).toHaveLength(0)
  })
})

/** One story_jobs table, in the statements reel-poster.ts sends. */
function table(
  rows: {
    id: number
    status: string
    url: string | null
    poster?: string | null
  }[]
) {
  const sql: string[] = []
  const pool = {
    query: async (q: string, p: unknown[] = []) => {
      const s = q.replace(/\s+/g, ' ').trim()
      sql.push(s)
      const row = rows.find(r => r.id === p[0])
      if (
        s.startsWith(
          "UPDATE story_jobs SET poster = '' WHERE id = $1 AND poster IS NULL"
        )
      ) {
        if (!row || (row.poster ?? null) !== null) return { rows: [] }
        row.poster = ''
        return { rows: [{ id: row.id }] }
      }
      if (s.startsWith('UPDATE story_jobs SET poster = $2 WHERE id = $1')) {
        row!.poster = String(p[1])
        return { rows: [] }
      }
      if (s.startsWith('SELECT id, url, poster FROM story_jobs')) {
        expect(s).toContain("status = 'done'")
        expect(s).toContain('poster IS NULL')
        return {
          rows: rows
            .filter(
              r => r.status === 'done' && r.url && (r.poster ?? null) === null
            )
            .sort((a, b) => b.id - a.id)
            .slice(0, Number(p[0])),
        }
      }
      throw new Error(`unexpected SQL: ${s}`)
    },
  }
  return { pool, sql }
}

describe('keeping a poster', () => {
  it('claims the row, draws once, keeps the link', async () => {
    const rows = [{ id: 1, status: 'done', url: REEL }]
    const { pool } = table(rows)
    let drawn = 0
    const draw = async () => (drawn++, 'https://shelf.example/1.jpg')
    expect(await keepPoster(pool, draw, 1, REEL)).toBe(
      'https://shelf.example/1.jpg'
    )
    expect(await keepPoster(pool, draw, 1, REEL)).toBeNull()
    expect(drawn).toBe(1)
    expect(rows[0]).toMatchObject({ poster: 'https://shelf.example/1.jpg' })
  })

  it('a failed poster stays tried and is never drawn again', async () => {
    const rows: Parameters<typeof table>[0] = [
      { id: 1, status: 'done', url: REEL },
    ]
    const { pool } = table(rows)
    let drawn = 0
    const draw = async () => (drawn++, null)
    expect(await keepPoster(pool, draw, 1, REEL)).toBeNull()
    expect(await keepPoster(pool, draw, 1, REEL)).toBeNull()
    expect(drawn).toBe(1)
    expect(rows[0].poster).toBe('')
  })

  it('never throws: a database that fails answers null', async () => {
    const pool = {
      query: async () => {
        throw new Error('column "poster" does not exist')
      },
    }
    expect(await keepPoster(pool, async () => 'x', 1, REEL)).toBeNull()
    expect(await sweepPosters(pool, async () => 'x')).toBe(0)
  })
})

describe('the sweep', () => {
  it('draws POSTER_SWEEP_MAX missing posters a round, newest first, never a tried one', async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(id => ({
      id,
      status: id === 6 ? 'running' : 'done',
      url: id === 6 ? null : `https://bucket.example/${id}.mp4`,
      poster: id === 4 ? '' : null,
    }))
    const { pool, sql } = table(rows)
    const drawn: string[] = []
    const draw = async (v: string) => (drawn.push(v), v.replace('.mp4', '.jpg'))
    expect(await sweepPosters(pool, draw)).toBe(SPEC.POSTER_SWEEP_MAX)
    expect(drawn).toEqual([5, 3, 2].map(i => `https://bucket.example/${i}.mp4`))
    expect(await sweepPosters(pool, draw)).toBe(1)
    expect(await sweepPosters(pool, draw)).toBe(0)
    expect(rows.find(r => r.id === 4)!.poster).toBe('')
    expect(sql.filter(s => s.startsWith('SELECT')).length).toBe(3)
  })
})
