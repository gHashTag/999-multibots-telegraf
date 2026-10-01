import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrivalFromSearch, reportArrival, reportWelcomeStep } from './traffic'

/**
 * THE APP COUNTS A TAGGED VISIT ONCE (epic #2974). Each case is a way the
 * count could be wrong: an untagged visit counted, a reload counted twice,
 * or a tag the link did not carry invented.
 */
describe('reading the tags of a visit', () => {
  it('takes utm_source and whatever else the link carried', () => {
    expect(
      arrivalFromSearch(
        '?utm_source=x&utm_medium=social&utm_campaign=blog&utm_content=gf-t&other=1'
      )
    ).toEqual({
      source: 'x',
      medium: 'social',
      campaign: 'blog',
      content: 'gf-t',
    })
    expect(arrivalFromSearch('utm_source=reddit')).toEqual({ source: 'reddit' })
  })

  it('no source, no arrival', () => {
    expect(arrivalFromSearch('')).toBeNull()
    expect(arrivalFromSearch('?utm_medium=social')).toBeNull()
  })
})

describe('reporting it', () => {
  beforeEach(() => sessionStorage.clear())

  it('sends the tags once per session, and never for an untagged visit', async () => {
    const send = vi.fn(
      async () => new Response('{}')
    ) as unknown as typeof fetch
    expect(await reportArrival('?utm_source=x', send)).toBe(true)
    expect(await reportArrival('?utm_source=x', send)).toBe(false)
    expect(await reportArrival('', send)).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = (
      send as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0]
    expect(url).toContain('/api/traffic/arrival')
    expect(JSON.parse(String(init.body))).toEqual({ source: 'x' })
  })

  it('a failed call never throws into the page', async () => {
    const send = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(reportArrival('?utm_source=threads', send)).resolves.toBe(
      false
    )
  })
})

describe('a step on the welcome screen', () => {
  beforeEach(() => sessionStorage.clear())

  it('is sent once per session per step and item, with nothing personal', async () => {
    const send = vi.fn(
      async () => new Response('{}')
    ) as unknown as typeof fetch
    expect(await reportWelcomeStep('lang', '', send)).toBe(true)
    expect(await reportWelcomeStep('lang', '', send)).toBe(false)
    expect(await reportWelcomeStep('package_order', 'blogger', send)).toBe(true)
    expect(await reportWelcomeStep('package_order', 'twin', send)).toBe(true)
    expect(send).toHaveBeenCalledTimes(3)
    const calls = (send as unknown as { mock: { calls: unknown[][] } }).mock
      .calls
    expect(String(calls[0][0])).toMatch(/\/api\/traffic\/welcome$/)
    expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
      step: 'lang',
    })
    expect(JSON.parse((calls[1][1] as RequestInit).body as string)).toEqual({
      step: 'package_order',
      item: 'blogger',
    })
  })

  it('a failed call is dropped, never thrown', async () => {
    const send = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await reportWelcomeStep('shown', '', send)).toBe(false)
  })
})
