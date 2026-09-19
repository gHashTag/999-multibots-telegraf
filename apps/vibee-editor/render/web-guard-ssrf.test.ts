import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ADDRESS_REFUSED,
  MAX_REDIRECT_HOPS,
  checkUrlShape,
  guardTargetUrl,
  normalizeHost,
  ownHostnames,
  readBoundedText,
  releaseProbe,
  resolveFinalUrl,
} from './src/agent/web-guard'

/**
 * The door, asserted rather than trusted.
 *
 * Every test here corresponds to a way the agent could have been aimed at
 * something it must never reach. They are written as the attack, not as the
 * rule, because a rule can be edited into meaninglessness while still passing
 * a test that only restates it.
 */

/**
 * The live branch of `resolveFinalUrl` -- the one taken when no `fetchImpl` is
 * injected -- is the only code that builds a dispatcher, and every other test
 * here injects `fetchImpl` and so never reaches it. These two recorders exist
 * to make that one branch observable. Both mocked names are used in exactly one
 * place each, inside that branch, so nothing else in the file is affected.
 */
type PinnedAgentSpy = { destroyed: boolean; closed: boolean }
let pinnedAgents: PinnedAgentSpy[] = []
let liveFetch: ((url: unknown, init: unknown) => Promise<unknown>) | null = null

vi.mock('undici', async importOriginal => {
  const actual = await importOriginal<typeof import('undici')>()
  return {
    ...actual,
    fetch: (url: never, init: never) =>
      liveFetch ? liveFetch(url, init) : actual.fetch(url, init),
  }
})

vi.mock('./src/lib/remoteMediaDuration', async importOriginal => {
  const actual =
    await importOriginal<typeof import('./src/lib/remoteMediaDuration')>()
  return {
    ...actual,
    createPinnedAgent: () => {
      const agent = {
        destroyed: false,
        closed: false,
        destroy: async () => {
          agent.destroyed = true
        },
        close: async () => {
          agent.closed = true
        },
      }
      pinnedAgents.push(agent)
      return agent
    },
  }
})

afterEach(() => {
  liveFetch = null
  pinnedAgents = []
})

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }]
const PRIVATE_LOOKUP = async () => [{ address: '10.0.0.7', family: 4 }]
const SPLIT_LOOKUP = async () => [
  { address: '93.184.216.34', family: 4 },
  { address: '169.254.169.254', family: 4 },
]

describe('web guard: shape', () => {
  it('accepts an ordinary https page', () => {
    const result = checkUrlShape('https://example.com/a/b?c=1')
    expect(result.ok).toBe(true)
  })

  it('refuses a scheme that is not http or https', () => {
    // file: reads the container's disk; gopher: and data: were both used in
    // published SSRF chains.
    for (const raw of [
      'file:///etc/passwd',
      'gopher://example.com/',
      'data:text/html,<b>x</b>',
      'javascript:alert(1)',
    ]) {
      const result = checkUrlShape(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('http')
    }
  })

  it('refuses a port that is not 80 or 443', () => {
    // 5432 is Postgres, 11434 is Ollama, 6379 is Redis. All of them answer
    // inside this project.
    for (const port of [5432, 6379, 8080, 11434]) {
      const result = checkUrlShape(`https://example.com:${port}/`)
      expect(result.ok).toBe(false)
    }
  })

  it('refuses credentials in the URL', () => {
    // A classic host-parsing trap: the real host is example.com, but a careless
    // reader sees the internal name first.
    const result = checkUrlShape(
      'http://postgres-nfrq.railway.internal@example.com/'
    )
    expect(result.ok).toBe(false)
    // A quoted fragment, not a regex: the repo's Cyrillic gate strips string
    // literals but not regex literals, so /.../ here would trip it.
    if (!result.ok) expect(result.reason).toContain('логин')
  })

  it('refuses internal names before any lookup happens', () => {
    for (const host of [
      'localhost',
      'metadata.google.internal',
      'postgres-nfrq.railway.internal',
      'printer.local',
      'whatever.home.arpa',
      'secret.onion',
    ]) {
      const result = checkUrlShape(`http://${host}/`)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe(ADDRESS_REFUSED)
    }
  })

  it('refuses non-unicast IP literals, including the metadata endpoint', () => {
    for (const host of [
      '169.254.169.254',
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '0.0.0.0',
      '[::1]',
      '[fd00::1]',
      // IPv4-mapped IPv6: the form a regex-based range check misses.
      '[::ffff:169.254.169.254]',
    ]) {
      const result = checkUrlShape(`http://${host}/`)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe(ADDRESS_REFUSED)
    }
  })

  it('refuses our own infrastructure even though it is publicly routable', () => {
    // "Public" is not "not ours". Every sibling service in the Railway project
    // has a public edge hostname, and our own API is a fine thing to aim a
    // fetcher at.
    for (const host of [
      'vibee-render-production.up.railway.app',
      'anything.railway.app',
      'app.t27.ai',
      // dead-domain-ok: the test asserts this host is REFUSED, so the mention
      // is the point.
      '999-multibots-telegraf.fly.dev',
    ]) {
      const result = checkUrlShape(`https://${host}/api/agent/chat`)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe(ADDRESS_REFUSED)
    }
  })

  it('self-identity does not depend on env vars being set', () => {
    // PUBLIC_URL is NOT set on the live service. A denylist built only from the
    // env would be empty on the one machine that matters.
    const saved = process.env.PUBLIC_URL
    delete process.env.PUBLIC_URL
    try {
      const result = checkUrlShape(
        'https://vibee-render-production.up.railway.app/health'
      )
      expect(result.ok).toBe(false)
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_URL
      else process.env.PUBLIC_URL = saved
    }
  })

  it('picks up service URLs from the env on top of the constants', () => {
    const saved = process.env.ZEP_API_URL
    process.env.ZEP_API_URL = 'http://zep-internal.example.org:5557'
    try {
      expect(ownHostnames().has('zep-internal.example.org')).toBe(true)
      const result = checkUrlShape('https://zep-internal.example.org/')
      expect(result.ok).toBe(false)
    } finally {
      if (saved === undefined) delete process.env.ZEP_API_URL
      else process.env.ZEP_API_URL = saved
    }
  })

  it('normalizes the spellings a denylist would otherwise miss', () => {
    // Trailing dot, upper case and IPv6 brackets are three ways to write the
    // same host that a naive string compare treats as three hosts.
    expect(normalizeHost('LocalHost.')).toBe('localhost')
    expect(normalizeHost('[::1]')).toBe('::1')
    expect(checkUrlShape('http://LOCALHOST/').ok).toBe(false)
    expect(checkUrlShape('http://localhost./').ok).toBe(false)
  })

  it('gives one single refusal for every address-derived denial', () => {
    // Distinct reasons are an oracle: they tell a caller what our resolver
    // sees and what we are called internally.
    const reasons = new Set(
      [
        'http://localhost/',
        'http://10.0.0.1/',
        'https://vibee-render-production.up.railway.app/',
        'http://postgres-nfrq.railway.internal/',
      ].map(raw => {
        const result = checkUrlShape(raw)
        return result.ok ? 'accepted' : result.reason
      })
    )
    expect([...reasons]).toEqual([ADDRESS_REFUSED])
  })
})

describe('web guard: DNS', () => {
  it('refuses a public name that resolves privately', async () => {
    // The hole in the existing assertFetchable: its range check only runs when
    // the host is already a bare IP, so a name is never checked at all.
    const result = await guardTargetUrl('https://rebind.example.com/', {
      lookupImpl: PRIVATE_LOOKUP,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(ADDRESS_REFUSED)
  })

  it('refuses a name with one public and one internal record', async () => {
    const result = await guardTargetUrl('https://split.example.com/', {
      lookupImpl: SPLIT_LOOKUP,
    })
    expect(result.ok).toBe(false)
  })

  it('accepts a name that resolves publicly', async () => {
    const result = await guardTargetUrl('https://example.com/x', {
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(true)
  })
})

describe('web guard: redirects', () => {
  /** A fetch double that answers a scripted chain and records what it saw. */
  function chain(steps: Array<{ status: number; location?: string }>) {
    const asked: string[] = []
    let index = 0
    const fetchImpl = (async (input: any) => {
      asked.push(String(input))
      const step = steps[Math.min(index, steps.length - 1)]
      index += 1
      const headers = new Headers()
      if (step.location) headers.set('location', step.location)
      return new Response(null, { status: step.status, headers })
    }) as unknown as typeof fetch
    return { fetchImpl, asked }
  }

  it('re-validates every hop, so a public page cannot launder a private one', async () => {
    // THE hole this file exists for: hop 1 is example.com and passes; hop 2 is
    // the cloud metadata endpoint. Anything that checks only the first URL --
    // including handing it to a third-party reader -- passes this attack.
    const { fetchImpl, asked } = chain([
      { status: 302, location: 'http://169.254.169.254/latest/meta-data/' },
      { status: 200 },
    ])
    const result = await resolveFinalUrl('https://example.com/start', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(ADDRESS_REFUSED)
    // It never connected to the metadata endpoint: the chain stopped at the
    // check, not at the socket.
    expect(asked.some(url => url.includes('169.254'))).toBe(false)
  })

  it('returns the FINAL url, not the one it was given', async () => {
    const { fetchImpl } = chain([
      { status: 301, location: 'https://example.com/moved' },
      { status: 200 },
    ])
    const result = await resolveFinalUrl('https://example.com/start', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.url.href).toBe('https://example.com/moved')
  })

  it('stops following after a bounded number of hops', async () => {
    const { fetchImpl, asked } = chain([
      { status: 302, location: 'https://example.com/1' },
      { status: 302, location: 'https://example.com/2' },
      { status: 302, location: 'https://example.com/3' },
      { status: 302, location: 'https://example.com/4' },
      { status: 302, location: 'https://example.com/5' },
    ])
    const result = await resolveFinalUrl('https://example.com/start', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(false)
    expect(asked.length).toBeLessThanOrEqual(MAX_REDIRECT_HOPS + 1)
  })

  it('treats an unreachable page as a refusal, not an exception', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const result = await resolveFinalUrl('https://example.com/', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('страница не ответила')
  })
})

describe('web guard: letting a probe go', () => {
  /**
   * These assert an ORDER, which is unusual for a test and is the point: both
   * orders SUCCEED. The wrong one merely costs the whole deadline per URL --
   * 20014ms against a 20s signal on the live service, against 54ms for the
   * right one -- and no log line anywhere says "stalled", so a stopwatch in a
   * test is the only instrument that sees it.
   *
   * The split below matters as much as the order. The first three pin
   * `releaseProbe` itself; the last two pin that `resolveFinalUrl` actually
   * calls it, on the injected path and on the live one. A correct
   * `releaseProbe` that nobody calls reads exactly like a fixed bug.
   */
  function fakes(cancel: () => Promise<void> = async () => undefined) {
    const order: string[] = []
    const response = {
      body: {
        cancel: async () => {
          order.push('cancel')
          await cancel()
        },
      },
    } as unknown as Response
    const agent = {
      destroy: async () => {
        order.push('destroy')
      },
      close: async () => {
        order.push('close')
      },
    }
    return { order, response, agent }
  }

  it('cancels the body before it drops the dispatcher', async () => {
    const { order, response, agent } = fakes()
    await releaseProbe(response, agent as never)
    expect(order).toEqual(['cancel', 'destroy'])
  })

  it('destroys rather than closes, because close waits for the body', async () => {
    const { order, response, agent } = fakes()
    await releaseProbe(response, agent as never)
    expect(order).not.toContain('close')
  })

  it('still drops the dispatcher when the body refuses to cancel', async () => {
    const { order, response, agent } = fakes(async () => {
      throw new Error('already gone')
    })
    await releaseProbe(response, agent as never)
    expect(order).toEqual(['cancel', 'destroy'])
  })

  it('releases every hop of a redirect chain, not just the last', async () => {
    const cancelled: string[] = []
    let index = 0
    const steps = [
      { status: 302 as const, location: 'https://example.com/two' },
      { status: 200 as const, location: undefined },
    ]
    const fetchImpl = (async (input: any) => {
      const step = steps[Math.min(index, steps.length - 1)]
      const seen = String(input)
      index += 1
      const headers = new Headers()
      if (step.location) headers.set('location', step.location)
      const response = new Response(null, { status: step.status, headers })
      Object.defineProperty(response, 'body', {
        value: {
          cancel: async () => {
            cancelled.push(seen)
          },
        },
      })
      return response
    }) as unknown as typeof fetch

    const result = await resolveFinalUrl('https://example.com/one', {
      fetchImpl,
      lookupImpl: PUBLIC_LOOKUP,
    })
    expect(result.ok).toBe(true)
    expect(cancelled).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ])
  })

  it('drops the dispatcher it pinned, on the path that actually makes one', async () => {
    /*
     * Every test above drives `resolveFinalUrl` through an injected `fetchImpl`,
     * which builds no dispatcher at all. So handing `undefined` where the agent
     * belongs -- leaking a connection pool per hop, which is the shape the
     * original bug had -- leaves all of them green. This is the only assertion
     * that watches the branch the service actually runs.
     */
    liveFetch = async () => {
      const response = new Response(null, { status: 200 })
      Object.defineProperty(response, 'body', {
        value: { cancel: async () => undefined },
      })
      return response
    }

    const result = await resolveFinalUrl('https://example.com/one', {
      lookupImpl: PUBLIC_LOOKUP,
    })

    expect(result.ok).toBe(true)
    expect(pinnedAgents, 'the live branch was never taken').toHaveLength(1)
    expect(
      pinnedAgents[0].destroyed,
      'the pinned dispatcher outlived the probe'
    ).toBe(true)
    expect(
      pinnedAgents[0].closed,
      'close() is the graceful one that waits for the unread body'
    ).toBe(false)
  })
})

describe('web guard: bounded reading', () => {
  it('stops at the cap even when the body never ends', async () => {
    // A page that streams forever is an out-of-memory crash of the whole
    // render service, not a slow tool call.
    let chunks = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1
        controller.enqueue(new Uint8Array(1024).fill(65))
      },
    })
    const text = await readBoundedText(new Response(body), 4096)
    expect(text.length).toBe(4096)
    expect(chunks).toBeLessThan(64)
  })

  it('does not trust content-length, but does use it to skip early', async () => {
    const response = new Response('short', {
      headers: { 'content-length': '999999' },
    })
    expect(await readBoundedText(response, 1024)).toBe('')
  })

  it('returns the whole body when it fits', async () => {
    expect(await readBoundedText(new Response('hello'), 1024)).toBe('hello')
  })
})
