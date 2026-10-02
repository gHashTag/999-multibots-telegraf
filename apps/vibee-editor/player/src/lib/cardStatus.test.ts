import { describe, expect, it, vi } from 'vitest'
import { lastPage, linkedPrs, readCardStatus, rollupChecks } from './cardStatus'

/**
 * THE TASK'S WORK IN THE CARD'S SHEET (spec kanban-card-chat.t27 v2).
 * The spec's own tests run against these functions in render's
 * src/spec/kanban-card-chat.test.ts; here are the GitHub shapes and the
 * cache, which the spec does not see.
 */

const xref = (
  repo: string,
  number: number,
  extra: Record<string, unknown> = {},
  at = '2026-10-01T10:00:00Z'
) => ({
  event: 'cross-referenced',
  created_at: at,
  source: {
    issue: {
      number,
      title: `PR ${number}`,
      state: 'open',
      html_url: `https://github.com/${repo}/pull/${number}`,
      repository: { full_name: repo },
      pull_request: {
        html_url: `https://github.com/${repo}/pull/${number}`,
        merged_at: null,
      },
      ...extra,
    },
  },
})

describe('linkedPrs', () => {
  it('keeps pull requests from any repository, once each', () => {
    const prs = linkedPrs([
      xref('gHashTag/t27', 5389),
      xref('gHashTag/999-multibots-telegraf', 3208),
      xref('gHashTag/t27', 5389),
      { event: 'labeled' },
      // An issue that mentions this one is not a pull request.
      xref('gHashTag/t27', 5000, { pull_request: undefined }),
    ])
    expect(prs.map(p => `${p.repo}#${p.number}`)).toEqual([
      'gHashTag/t27#5389',
      'gHashTag/999-multibots-telegraf#3208',
    ])
  })

  it('puts open first, then merged, then closed; newest first in each', () => {
    const prs = linkedPrs([
      xref('o/r', 1, { state: 'closed' }),
      xref(
        'o/r',
        2,
        {
          state: 'closed',
          pull_request: { html_url: 'u', merged_at: '2026-10-01' },
        },
        '2026-10-01T09:00:00Z'
      ),
      xref('o/r', 3, {}, '2026-10-01T08:00:00Z'),
      xref('o/r', 4, { draft: true }, '2026-10-01T11:00:00Z'),
    ])
    expect(prs.map(p => [p.number, p.state])).toEqual([
      [4, 'open'],
      [3, 'open'],
      [2, 'merged'],
      [1, 'closed'],
    ])
    expect(prs[0].draft).toBe(true)
  })

  it('reads nothing out of a body that is not a timeline', () => {
    expect(linkedPrs({ message: 'API rate limit exceeded' })).toEqual([])
  })
})

describe('rollupChecks', () => {
  const run = (status: string, conclusion: string | null = null) => ({
    status,
    conclusion,
  })
  it('one failure outranks everything; neutral and skipped pass', () => {
    expect(
      rollupChecks({
        check_runs: [run('completed', 'success'), run('completed', 'failure')],
      })
    ).toBe('fail')
    expect(
      rollupChecks({
        check_runs: [run('in_progress'), run('completed', 'success')],
      })
    ).toBe('pending')
    expect(
      rollupChecks({
        check_runs: [run('completed', 'neutral'), run('completed', 'skipped')],
      })
    ).toBe('pass')
    expect(rollupChecks({ check_runs: [] })).toBe('none')
  })
  it('a timed-out or cancelled check is not a pass', () => {
    expect(rollupChecks({ check_runs: [run('completed', 'timed_out')] })).toBe(
      'fail'
    )
    expect(rollupChecks({ check_runs: [run('completed', 'cancelled')] })).toBe(
      'fail'
    )
  })
})

const memory = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    size: () => m.size,
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body))
const limited = (resetS: number) =>
  new Response('{"message":"API rate limit exceeded"}', {
    status: 403,
    headers: { 'x-ratelimit-reset': String(resetS) },
  })

describe('readCardStatus', () => {
  it('the public limit is "not measured, again at", never "no PR"', async () => {
    const storage = memory()
    const status = await readCardStatus('gHashTag/t27', 5382, {
      fetchImpl: vi.fn(async () => limited(1790000000)) as never,
      storage,
    })
    expect(status).toEqual({ kind: 'unmeasured', retryAt: 1790000000000 })
    // Not cached: the next open tries again.
    expect(storage.size()).toBe(0)
  })

  it('a network failure is "not measured" too, without a time', async () => {
    const status = await readCardStatus('gHashTag/t27', 5382, {
      fetchImpl: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as never,
      storage: memory(),
    })
    expect(status).toEqual({ kind: 'unmeasured', retryAt: null })
  })

  it('reads checks for open PRs only, at most CHECKS_PRS_MAX', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('/timeline'))
        return json([
          xref('o/r', 1),
          xref('o/r', 2),
          xref('o/r', 3),
          xref('o/r', 4),
          xref('o/r', 5, { state: 'closed' }),
        ])
      return json({
        check_runs: [{ status: 'completed', conclusion: 'failure' }],
      })
    })
    const storage = memory()
    const status = await readCardStatus('o/r', 9, {
      fetchImpl: fetchImpl as never,
      storage,
    })
    expect(status.kind).toBe('prs')
    if (status.kind !== 'prs') return
    expect(status.prs).toHaveLength(3)
    expect(status.more).toBe(2)
    expect(status.prs.map(p => p.checks)).toEqual(['fail', 'fail', undefined])
    // One read per PR, by its head ref: no pulls/<n> read for the sha.
    expect(urls.filter(u => u.includes('/pulls/'))).toHaveLength(0)
    expect(urls.filter(u => u.includes('/check-runs'))).toEqual([
      'https://api.github.com/repos/o/r/commits/refs/pull/1/head/check-runs?per_page=100',
      'https://api.github.com/repos/o/r/commits/refs/pull/2/head/check-runs?per_page=100',
    ])
    expect(status.partial).toBe(false)
    expect(storage.size()).toBe(1)
  })

  it('checks the limit stopped stay unread and the answer is not cached', async () => {
    const storage = memory()
    const status = await readCardStatus('o/r', 9, {
      fetchImpl: vi.fn(async (url: string) =>
        url.includes('/timeline') ? json([xref('o/r', 1)]) : limited(1)
      ) as never,
      storage,
    })
    expect(status.kind === 'prs' && status.prs[0].checks).toBeUndefined()
    expect(storage.size()).toBe(0)
  })

  it('serves a fresh cache without reading, and reads past STATUS_CACHE_S', async () => {
    const storage = memory()
    const fetchImpl = vi.fn(async () => json([]))
    let t = 1_000_000
    const opts = { fetchImpl: fetchImpl as never, storage, now: () => t }
    expect(await readCardStatus('o/r', 9, opts)).toEqual({ kind: 'none' })
    t += 299_000
    await readCardStatus('o/r', 9, opts)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    t += 2_000
    await readCardStatus('o/r', 9, opts)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  const paged = (body: unknown, last: number) =>
    new Response(JSON.stringify(body), {
      headers: {
        link: `<https://api.github.com/repositories/1/issues/9/timeline?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/issues/9/timeline?per_page=100&page=${last}>; rel="last"`,
      },
    })

  it('reads the last page too: the newest PRs live there', async () => {
    const urls: string[] = []
    const status = await readCardStatus('o/r', 9, {
      storage: null,
      fetchImpl: vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('page=2')) return json([xref('o/r', 77)])
        if (url.includes('/timeline'))
          return paged([xref('o/r', 1, { state: 'closed' })], 2)
        return json({ check_runs: [] })
      }) as never,
    })
    expect(urls.filter(u => u.includes('/timeline'))).toHaveLength(2)
    expect(status.kind === 'prs' && status.prs[0]).toMatchObject({
      number: 77,
      state: 'open',
    })
    // Two pages are the whole timeline: the count is a count.
    expect(status.kind === 'prs' && status.partial).toBe(false)
  })

  it('skips the middle and says so: "more" is a floor', async () => {
    const urls: string[] = []
    const status = await readCardStatus('o/r', 9, {
      storage: null,
      fetchImpl: vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('page=5')) return json([])
        return paged(
          [1, 2, 3, 4].map(n => xref('o/r', n, { state: 'closed' })),
          5
        )
      }) as never,
    })
    expect(urls).toHaveLength(2)
    expect(status).toMatchObject({ kind: 'prs', more: 1, partial: true })
  })

  it('no PR at either end of a long timeline is not "no PR"', async () => {
    const status = await readCardStatus('o/r', 9, {
      storage: null,
      fetchImpl: vi.fn(async (url: string) =>
        url.includes('page=3') ? json([]) : paged([], 3)
      ) as never,
    })
    expect(status).toEqual({ kind: 'prs', prs: [], more: 0, partial: true })
  })
})

describe('readCardStatus with the server door (v4)', () => {
  const prs = {
    kind: 'prs',
    prs: [
      {
        repo: 'o/r',
        number: 1,
        title: 'x',
        state: 'open',
        draft: false,
        url: 'u',
        checks: 'pass',
      },
    ],
    more: 0,
    partial: false,
  }

  it('a measured answer is used and cached; GitHub is not read', async () => {
    const storage = memory()
    const github = vi.fn(async () => json([]))
    const door = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ configured: true, measured: true, status: prs })
        )
    )
    const opts = { storage, door, fetchImpl: github as never }
    expect(await readCardStatus('o/r', 9, opts)).toEqual(prs)
    expect(await readCardStatus('o/r', 9, opts)).toEqual(prs)
    expect(door).toHaveBeenCalledTimes(1)
    expect(github).not.toHaveBeenCalled()
  })

  it('a door that is down or answers nonsense is skipped, not trusted', async () => {
    for (const door of [
      async () => {
        throw new TypeError('Failed to fetch')
      },
      async () => new Response('<html>', { status: 200 }),
      async () =>
        new Response(
          JSON.stringify({ measured: true, status: { kind: 'prs' } })
        ),
    ]) {
      const github = vi.fn(async () => json([]))
      const s = await readCardStatus('o/r', 9, {
        storage: null,
        door,
        fetchImpl: github as never,
      })
      expect(github).toHaveBeenCalled()
      expect(s).toEqual({ kind: 'none' })
    }
  })
})

describe('lastPage', () => {
  it('reads rel="last" and nothing else', () => {
    expect(
      lastPage(
        '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=4>; rel="last"'
      )
    ).toEqual({ url: 'https://api.github.com/x?page=4', page: 4 })
    expect(lastPage('<https://api.github.com/x?page=2>; rel="next"')).toBeNull()
    expect(lastPage(null)).toBeNull()
  })
})
