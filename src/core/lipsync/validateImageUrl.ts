/**
 * Is this image URL one a render provider can actually fetch?
 *
 * Every lip-sync provider is a third party that downloads `imageUrl` from its
 * own machines. Until now nothing checked the value: the builder copied it
 * through untouched, so a string that no outside server could ever fetch --
 * 'invalid-url', a file:// path, http://localhost:3000/img.jpg -- was accepted,
 * sent, and BILLED. The job is created before the fetch fails, so we pay for
 * the refusal and then refund the person out of our own pocket.
 *
 * This is deliberately a check for *fetchability from the public internet*, not
 * a check that the picture exists. Whether the file is there, is an image, or
 * is the right size is the provider's answer to give -- we cannot know it
 * without fetching, and guessing would reject valid URLs. What we can know for
 * free is that a URL with no host, a private host, or a scheme nobody serves
 * over is a guaranteed waste of money.
 */

/** A host the provider's servers cannot reach, however well-formed the URL is. */
const UNREACHABLE_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
])

/** Private and link-local ranges: routable for us, not for them. */
const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

/**
 * `reason` is present exactly when `ok` is false.
 *
 * The natural shape for that is a discriminated union,
 * `{ok: true} | {ok: false, reason: string}`, and it was written that way
 * first. It does not compile here: tsconfig.json sets "strict": false, which
 * turns off strictNullChecks, and without strictNullChecks TypeScript does not
 * narrow discriminated unions at all -- `if (!verdict.ok)` still leaves the
 * value as the whole union, so reading `.reason` is an error. An optional
 * field is the honest shape under this compiler setting.
 */
export type ImageUrlVerdict = {
  ok: boolean
  reason?: string
}

export function validateImageUrl(imageUrl: unknown): ImageUrlVerdict {
  if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    return { ok: false, reason: 'Image URL is empty' }
  }

  let parsed: URL
  try {
    parsed = new URL(imageUrl.trim())
  } catch {
    return { ok: false, reason: `Not a URL: ${preview(imageUrl)}` }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    // file:, data:, ftp:, javascript: -- nothing a remote fetch can follow.
    return {
      ok: false,
      reason: `Image URL must be http(s), got ${parsed.protocol}`,
    }
  }

  if (!parsed.hostname) {
    return { ok: false, reason: 'Image URL has no host' }
  }

  // user:password@host would hand our credentials to the render provider along
  // with the request. If a URL needs them, it is not a URL we may forward.
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Image URL must not carry credentials' }
  }

  const host = parsed.hostname.toLowerCase()
  if (
    UNREACHABLE_HOSTNAMES.has(host) ||
    PRIVATE_IPV4.test(host) ||
    host.endsWith('.local')
  ) {
    return {
      ok: false,
      reason: `Image URL host is not reachable from the internet: ${host}`,
    }
  }

  return { ok: true }
}

function preview(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}...` : trimmed
}
