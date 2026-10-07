/**
 * THE FREE LEG OF THE IMAGE CHAIN (image-chain.ts, `pollinations/flux`).
 *
 * WHY A FREE LEG AT ALL. On 2026-09-29 both paid legs refused with the
 * provider's own words -- FAL "User is locked. Reason: Exhausted balance",
 * Replicate "Insufficient credit" (402) -- and the third, Kie, was priced
 * out of the picture ($0.02 against the $0.005 the 2-token charge covers,
 * on purpose: it is the talking heads' purse). image_generate had NO leg it
 * could run: every reel, every poster, every gift died on the same step,
 * and the honest answer to "why couldn't the agent make Tim's reel" was a
 * wallet, not a bug. A keyless $0 provider ordered AFTER the paid legs and
 * BEFORE the protected one turns that outage into a slower picture.
 *
 * THE PERSON STILL PAYS THE SAME 2 TOKENS. One price whichever leg draws is
 * the chain's rule (image-chain.ts, ON (5)); a free-for-us leg does not make
 * the picture free, and the free list says nothing of the kind
 * (pricing.ts). What the $0 buys is that the CHARGE now buys something.
 *
 * WHY THE LEG FETCHES THE IMAGE ITSELF instead of returning the URL blind:
 * every other leg hands back a URL it has seen a provider accept, and a leg
 * that returned an unverified string would make the chain report success
 * while the bytes were never drawn -- the failure would resurface one hop
 * later as "картинка сгенерирована, но не скачалась", which is the outage
 * wearing a costume. The GET both draws and verifies; the URL is
 * deterministic per (prompt, seed), so the S3 mirror fetch that follows
 * hits the provider's cache (measured 2026-09-29: identical md5, second
 * fetch 1.0 s).
 *
 * Source for the call, read 2026-09-29 (live probe, no account, no key):
 * GET https://image.pollinations.ai/prompt/{prompt}?width&height&nologo=true
 * &model=flux&seed=N -> 200 image/jpeg, ~5 s, aspect honoured (asked
 * 768x1344, got 580x1015 -- the ratio is what the service guarantees, not
 * the absolute pixels).
 *
 * `nologo=true` IS ASKED AND NOT GRANTED. Re-measured 2026-10-03: a keyless
 * 1024x1024 call came back 768x768 with "pollinations.ai" in the corner; the
 * flag only works for an account. The parameter stays (it costs nothing and
 * would start working with a key), but the picture is a stamped draft, and
 * the tool says so in `watermark` (image-chain.ts, watermarkOf).
 */

/** Where the free leg draws. Keyless: there is no token to read. */
const BASE = 'https://image.pollinations.ai/prompt/'

/**
 * The frame the free leg asks for, per aspect ratio the route can emit
 * (render-server.ts getAspectRatio). Pollinations honours the RATIO and
 * picks its own pixels, so these only have to be the ratio in numbers.
 */
export function pollinationsSize(aspectRatio: string): {
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1344, height: 768 }
    case '9:16':
      return { width: 768, height: 1344 }
    case '4:3':
      return { width: 1200, height: 900 }
    case '3:4':
      return { width: 900, height: 1200 }
    default:
      return { width: 1024, height: 1024 }
  }
}

/**
 * The deterministic URL of one image. Pure, so a test can hold the whole
 * shape without owning a network. `seed` is the caller's choice: the leg
 * passes a fresh random one, the test a fixed one.
 */
export function pollinationsImageUrl(
  prompt: string,
  aspectRatio: string,
  seed: number
): string {
  const { width, height } = pollinationsSize(aspectRatio)
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model: 'flux',
    seed: String(seed),
  })
  return `${BASE}${encodeURIComponent(prompt)}?${params}`
}

/**
 * Draw one image on the free leg and return its URL -- the same URL the
 * verifier fetched, which the S3 mirror will fetch again from cache.
 * Throws the way the other legs throw: a refusal message the chain records
 * in `tried` verbatim, never a swallowed undefined.
 */
export async function generateImageViaPollinations(
  prompt: string,
  aspectRatio: string,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<string> {
  const send = opts.fetchImpl ?? fetch
  const seed = Math.floor(Math.random() * 1_000_000_000)
  const url = pollinationsImageUrl(prompt, aspectRatio, seed)
  const response = await send(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Pollinations failed: ${response.status} - ${text.slice(0, 200)}`
    )
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `Pollinations did not return an image (content-type ${contentType || 'unknown'})`
    )
  }
  // Prove the bytes exist before promising a URL: read the body once. The
  // mirror fetch that follows re-downloads from the provider's cache, so
  // this read is the only generation this leg pays for -- and it costs
  // nothing but the seconds.
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength < 1024) {
    throw new Error(
      `Pollinations returned ${bytes.byteLength} bytes -- too small to be a picture`
    )
  }
  return url
}
