import { describe, it, expect } from 'vitest'
import {
  generateImageViaPollinations,
  pollinationsImageUrl,
  pollinationsSize,
} from './src/pollinations-image'

/**
 * THE FREE LEG'S OWN CONTRACT, checked without a network.
 *
 * The chain (image-chain.test.ts) proves the leg is ordered and priced; this
 * file proves the CALL is what its $0 claims: a keyless GET whose URL a test
 * can hold whole. The doubles are a fetch that answers exactly what the test
 * says -- nothing here reaches pollinations.ai, the way nothing in the chain
 * suite reaches FAL.
 */

/** A fetch double: one canned response, remembering the URL it served. */
function oneFetch(res: Response) {
  const asked: string[] = []
  const fetchImpl = (async (url: string) => {
    asked.push(String(url))
    return res
  }) as unknown as typeof fetch
  return { fetchImpl, asked }
}

const imageResponse = (bytes = 80_000) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })

describe('the URL the free leg calls', () => {
  it('is the keyless GET with the prompt encoded and the model the leg names', () => {
    const url = pollinationsImageUrl('маяк на скале, гравюра', '9:16', 424242)
    expect(url).toContain('https://image.pollinations.ai/prompt/')
    // The prompt is URL-encoded, not pasted raw: spaces and the Cyrillic
    // both survive the round trip the provider sees.
    expect(url).toContain(encodeURIComponent('маяк на скале, гравюра'))
    expect(url).toContain('model=flux')
    expect(url).toContain('nologo=true')
    expect(url).toContain('seed=424242')
    // No key, no token: there is no account to name. The URL a test can
    // build whole is the URL the provider can serve whole.
    expect(url).not.toMatch(/key|token/i)
  })

  it('asks for the frame of the aspect ratio the route computed', () => {
    const cases: [string, number, number][] = [
      ['1:1', 1024, 1024],
      ['16:9', 1344, 768],
      ['9:16', 768, 1344],
      ['4:3', 1200, 900],
      ['3:4', 900, 1200],
      // An aspect the route cannot emit still draws: the square is the
      // default, not a crash.
      ['21:9', 1024, 1024],
    ]
    for (const [aspect, width, height] of cases) {
      expect(pollinationsSize(aspect)).toEqual({ width, height })
      expect(pollinationsImageUrl('x', aspect, 1)).toContain(
        `width=${width}&height=${height}`
      )
    }
  })

  it('is deterministic in the seed, so the mirror fetch gets the same bytes', () => {
    expect(pollinationsImageUrl('same', '1:1', 7)).toBe(
      pollinationsImageUrl('same', '1:1', 7)
    )
    expect(pollinationsImageUrl('same', '1:1', 7)).not.toBe(
      pollinationsImageUrl('same', '1:1', 8)
    )
  })
})

describe('the free leg delivers or refuses, never pretends', () => {
  it('returns the very URL it fetched when the bytes are an image', async () => {
    const { fetchImpl, asked } = oneFetch(imageResponse())
    const url = await generateImageViaPollinations('маяк', '9:16', {
      fetchImpl,
    })
    expect(asked).toEqual([url])
    expect(url).toContain('https://image.pollinations.ai/prompt/')
  })

  it('a non-image answer is a refusal, not a URL', async () => {
    const { fetchImpl } = oneFetch(
      new Response('<html>rate limited</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    )
    await expect(
      generateImageViaPollinations('маяк', '1:1', { fetchImpl })
    ).rejects.toThrow(/did not return an image/)
  })

  it("an error status is a refusal in the provider's own words", async () => {
    const { fetchImpl } = oneFetch(
      new Response('busy, retry later', { status: 503 })
    )
    await expect(
      generateImageViaPollinations('маяк', '1:1', { fetchImpl })
    ).rejects.toThrow('Pollinations failed: 503')
  })

  it('a picture-sized lie is still a lie: bytes under 1KB are not a picture', async () => {
    const { fetchImpl } = oneFetch(imageResponse(300))
    await expect(
      generateImageViaPollinations('маяк', '1:1', { fetchImpl })
    ).rejects.toThrow(/too small to be a picture/)
  })
})
