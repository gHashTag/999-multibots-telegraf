import { createHash } from 'node:crypto'

/**
 * A NAMESPACE FOR AN INTERNAL CALLER THAT IS NOT THE KEY ITSELF.
 *
 * Internal tools arrive with X-Api-Key after the global auth gate has already
 * validated it. They still need a stable, non-empty owner so one service
 * caller cannot list another caller's jobs -- and that owner is written into
 * memory and storage, where a raw key has no business being.
 *
 * Lived inside render-server.ts, where nothing could call it: importing that
 * file starts the server, so the only guard possible was a test that read the
 * source and matched the words `createHash('sha256')`. That guard goes red
 * when somebody renames a variable and stays silent if the digest is dropped
 * for the raw key -- exactly backwards (form 87).
 *
 * Here it is eleven lines with no dependencies, so the property can be run
 * instead of read.
 */
export function serviceOwnerFromKey(
  raw: string | string[] | undefined
): string | null {
  const key = Array.isArray(raw) ? raw[0] : raw
  if (!key?.trim()) return null
  return `service:${createHash('sha256').update(key).digest('hex')}`
}
