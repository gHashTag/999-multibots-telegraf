import { describe, expect, it, vi } from 'vitest'
import { linkedPrs, readCardStatus, rollupChecks } from './cardStatus'

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
      if (url.includes('/pulls/')) return json({ head: { sha: 'abc' } })
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
    expect(urls.filter(u => u.includes('/pulls/'))).toHaveLength(2)
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
})
