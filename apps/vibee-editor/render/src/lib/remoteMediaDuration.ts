import { lookup as systemLookup } from 'node:dns/promises'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import ipaddr from 'ipaddr.js'
import { Agent, fetch as undiciFetch } from 'undici'

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export type ResolvedAddress = { address: string; family: 4 | 6 }
export type AddressLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>

function normalizedHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

/**
 * Only globally-routable unicast addresses may be fetched. ipaddr.js also
 * classifies IPv4-mapped IPv6, CGNAT, documentation, benchmark and reserved
 * ranges, which are easy to miss with regular expressions.
 */
export function isPublicInternetAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(normalizedHostname(address))
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().range() === 'unicast'
    }
    return parsed.range() === 'unicast'
  } catch {
    return false
  }
}

export async function resolvePublicAddress(
  hostname: string,
  lookupImpl: AddressLookup = systemLookup as AddressLookup
): Promise<ResolvedAddress> {
  const normalized = normalizedHostname(hostname).toLowerCase()
  const literalFamily = ipaddr.isValid(normalized)
    ? ipaddr.parse(normalized).kind() === 'ipv4'
      ? 4
      : 6
    : 0
  const records = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await lookupImpl(normalized, { all: true, verbatim: true })

  if (records.length === 0) throw new Error('media host did not resolve')
  if (
    records.some(
      record =>
        (record.family !== 4 && record.family !== 6) ||
        !isPublicInternetAddress(record.address)
    )
  ) {
    throw new Error('media host resolves to a forbidden network')
  }

  // Keep the existing IPv4-first reliability policy while still validating
  // every A and AAAA answer above. The selected address is pinned below.
  const selected = records.find(record => record.family === 4) ?? records[0]
  return { address: selected.address, family: selected.family as 4 | 6 }
}

export function createPinnedLookup(resolved: ResolvedAddress) {
  return (_hostname: string, options: { all?: boolean }, callback: any) => {
    if (options?.all) {
      callback(null, [resolved])
      return
    }
    callback(null, resolved.address, resolved.family)
  }
}

export function createPinnedAgent(resolved: ResolvedAddress): Agent {
  return new Agent({
    connect: { lookup: createPinnedLookup(resolved) as any },
  })
}

async function withinDeadline<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw new Error('media download timed out')
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('media download timed out'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export async function downloadBoundedMediaToFile(
  url: URL,
  destination: string,
  options: {
    fetchImpl?: typeof fetch
    lookupImpl?: AddressLookup
    maxBytes?: number
    timeoutMs?: number
  } = {}
): Promise<number> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = AbortSignal.timeout(timeoutMs)
  let agent: Agent | undefined
  try {
    let response: Response
    if (options.fetchImpl) {
      response = await options.fetchImpl(url, {
        signal: deadline,
        redirect: 'error',
      })
    } else {
      const resolved = await withinDeadline(
        resolvePublicAddress(url.hostname, options.lookupImpl),
        deadline
      )
      agent = createPinnedAgent(resolved)
      response = (await undiciFetch(url, {
        dispatcher: agent,
        signal: deadline,
        redirect: 'error',
      })) as unknown as Response
    }
    if (!response.ok) {
      // The same trap web-guard's `releaseProbe` documents: throwing here
      // leaves the error body outstanding, and the `close()` below waits for
      // it, so a plain 404 costs the whole deadline instead of failing at once.
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`media download failed: HTTP ${response.status}`)
    }

    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel()
      throw new Error('media is too large to inspect')
    }
    if (!response.body) throw new Error('media body is unavailable')

    let total = 0
    try {
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          total += chunk.length
          if (total > maxBytes) {
            callback(new Error('media is too large to inspect'))
            return
          }
          callback(null, chunk)
        },
      })
      await pipeline(
        Readable.fromWeb(response.body as any),
        limiter,
        createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
        { signal: deadline }
      )
      if (total === 0) throw new Error('media is empty')
      return total
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined)
      throw error
    }
  } finally {
    await agent?.close()
  }
}
