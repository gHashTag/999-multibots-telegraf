import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const forget = vi.fn()
vi.mock('../hive/queen-client', async () => {
  const real = await vi.importActual<typeof import('../hive/queen-client')>(
    '../hive/queen-client'
  )
  return { ...real, forgetQueenIndex: () => forget() }
})

const { handleCardMove } = await import('./card-move')

function call(
  method: string,
  body: unknown,
  opts: Parameters<typeof handleCardMove>[3]
) {
  const req = new PassThrough() as PassThrough & { method: string }
  req.method = method
  req.end(body === undefined ? '' : JSON.stringify(body))
  let status = 0
  let out = ''
  const res = {
    writeHead: (s: number) => {
      status = s
    },
    end: (s: string) => {
      out = s
    },
  }
  return handleCardMove(req as never, res as never, '42', opts).then(() => ({
    status,
    body: JSON.parse(out),
  }))
}

const keeper = () => ['42']
const env = { TRIOS_API_TOKEN: 't' }
const queen = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('the move door through render (spec v5, S16)', () => {
  it('says what the sheet may show, and shows nothing without the door', async () => {
    const shut = await call('GET', undefined, { env, keeperIds: keeper })
    expect(shut).toEqual({
      status: 200,
      body: { offered: false, keeper: true, configured: true, door: false },
    })
    const open = await call('GET', undefined, {
      env,
      keeperIds: keeper,
      doorExists: true,
    })
    expect(open.body.offered).toBe(true)
    const stranger = await call('GET', undefined, {
      env,
      keeperIds: () => ['7'],
      doorExists: true,
    })
    expect(stranger.body.offered).toBe(false)
  })

  it('refuses before the Queen is asked', async () => {
    const fetchImpl = queen(200, { moved: true, reason: 'x' })
    const good = { number: 5, from: 'backlog', to: 'dropped' }
    const base = { env, keeperIds: keeper, doorExists: true, fetchImpl }
    expect((await call('PUT', good, base)).status).toBe(405)
    expect(
      (await call('POST', good, { ...base, keeperIds: () => [] })).status
    ).toBe(403)
    expect(
      (await call('POST', good, { ...base, doorExists: false })).status
    ).toBe(503)
    const noToken = await call('POST', good, { ...base, env: {} })
    expect(noToken).toMatchObject({ status: 503, body: { configured: false } })
    for (const bad of [
      { ...good, to: 'done' },
      { ...good, from: 'running' },
      { ...good, from: 'dropped' },
      { ...good, number: 0 },
      null,
    ])
      expect((await call('POST', bad, base)).status).toBe(400)
    expect(
      (await call('POST', { ...good, reason: 'x'.repeat(201) }, base)).status
    ).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("passes the Queen's word through, with render's token and the person's name", async () => {
    forget.mockClear()
    const fetchImpl = queen(200, {
      moved: true,
      reason: '#5 dropped',
      column: 'dropped',
    })
    const moved = await call(
      'POST',
      { number: 5, from: 'backlog', to: 'dropped', reason: 'dup' },
      { env, keeperIds: keeper, doorExists: true, fetchImpl }
    )
    expect(moved).toEqual({
      status: 200,
      body: { moved: true, reason: '#5 dropped', column: 'dropped' },
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toMatch(/\/queen\/move$/)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer t')
    expect(JSON.parse(String(init.body))).toMatchObject({
      by: 'tg:42',
      reason: 'dup',
    })
    expect(JSON.stringify(moved.body)).not.toContain('Bearer')
    expect(forget).toHaveBeenCalledTimes(1)

    forget.mockClear()
    const refused = await call(
      'POST',
      { number: 5, from: 'dropped', to: 'backlog' },
      {
        env,
        keeperIds: keeper,
        doorExists: true,
        fetchImpl: queen(409, {
          moved: false,
          reason: 'not dropped',
          column: 'backlog',
        }),
      }
    )
    expect(refused).toMatchObject({
      status: 409,
      body: { moved: false, reason: 'not dropped' },
    })
    expect(forget).not.toHaveBeenCalled()

    const silent = await call(
      'POST',
      { number: 5, from: 'backlog', to: 'dropped' },
      {
        env,
        keeperIds: keeper,
        doorExists: true,
        fetchImpl: vi.fn(async () => {
          throw new Error('down')
        }),
      }
    )
    expect(silent).toMatchObject({ status: 502, body: { moved: false } })
  })
})
