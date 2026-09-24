import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrivalFromSearch, reportArrival } from './traffic'

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
