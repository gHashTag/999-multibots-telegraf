import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * NO UNMASKED SESSION REPLAY.
 *
 * The player used to start Sentry Replay with maskAllText:false and
 * blockAllMedia:false: a recording of the screen with pairing codes, names
 * and chat text in the clear, and the page address with Telegram's launch
 * data in its fragment. Replay is removed. If it ever comes back, it must be
 * masked explicitly, and this test must be changed on purpose.
 *
 * @sentry/react is replaced by a fake that records what init receives and
 * what each integration was constructed with.
 */

const sentry = vi.hoisted(() => ({ init: vi.fn() }))

vi.mock('@sentry/react', () => {
  class BrowserTracing {
    name = 'BrowserTracing'
    constructor(public options?: unknown) {}
  }
  class Replay {
    name = 'Replay'
    constructor(public options?: unknown) {}
  }
  return {
    init: sentry.init,
    BrowserTracing,
    Replay,
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  }
})

import * as Sentry from '@sentry/react'
import { initSentry } from '@/lib/sentry'

interface Integration {
  name?: string
  options?: { maskAllText?: unknown; blockAllMedia?: unknown }
}

/** Every way these init options would record the screen unmasked. */
function replayProblems(options: {
  integrations?: Integration[]
  replaysSessionSampleRate?: number
  replaysOnErrorSampleRate?: number
}): string[] {
  const out: string[] = []
  for (const integration of options.integrations ?? []) {
    if (!/replay/i.test(integration?.name ?? '')) continue
    const o = integration.options ?? {}
    if (o.maskAllText !== true) out.push(`maskAllText is ${o.maskAllText}`)
    if (o.blockAllMedia !== true)
      out.push(`blockAllMedia is ${o.blockAllMedia}`)
  }
  return out
}

function initOptions() {
  vi.stubEnv('PROD', true)
  vi.stubEnv('VITE_SENTRY_DSN', 'https://fake@sentry.example.invalid/1')
  sentry.init.mockClear()
  initSentry()
  expect(sentry.init).toHaveBeenCalledTimes(1)
  return sentry.init.mock.calls[0][0]
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Sentry in the player', () => {
  it('records no screen: no Replay integration and no replay sample rates', () => {
    const options = initOptions()
    expect(replayProblems(options)).toEqual([])
    const names = (options.integrations as Integration[]).map(i => i.name)
    expect(names.filter(n => /replay/i.test(n ?? ''))).toEqual([])
    expect(options.replaysSessionSampleRate).toBeUndefined()
    expect(options.replaysOnErrorSampleRate).toBeUndefined()
  })

  it('control: outside a production build with a DSN, init is not called', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://fake@sentry.example.invalid/1')
    sentry.init.mockClear()
    initSentry()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('negative control: the old unmasked Replay is caught', () => {
    const old = {
      integrations: [
        new Sentry.Replay({ maskAllText: false, blockAllMedia: false }),
      ] as unknown as Integration[],
    }
    expect(replayProblems(old)).toEqual([
      'maskAllText is false',
      'blockAllMedia is false',
    ])
  })

  it('negative control: a Replay relying on defaults, not explicit masking, is caught', () => {
    const implicit = {
      integrations: [new Sentry.Replay()] as unknown as Integration[],
    }
    expect(replayProblems(implicit)).toHaveLength(2)
  })
})
