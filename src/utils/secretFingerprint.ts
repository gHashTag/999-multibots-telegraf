import { createHash } from 'crypto'

/**
 * A SECRET'S PREFIX IS STILL THE SECRET.
 *
 * The habit this replaces is everywhere in startup and provider code:
 *
 *   console.log('[ElevenLabs] Initializing with key:', apiKey.substring(0, 10))
 *
 * and it was written for a real need -- when two environments disagree, you
 * have to be able to tell WHICH key is loaded. The prefix answers that, and
 * pays for it by putting key material into Railway's log retention for ever.
 *
 * This repository already settled the question once. PR #2363 replaced
 * `value.substring(0, 20)` in the Infisical loader with eight hex characters of
 * SHA-256, under the comment "Never print key material: only a short digest and
 * the length." The decision was right and it was made in one file; six other
 * sites kept printing prefixes, and the ratchet that should have caught them --
 * src/__tests__/security/no-secret-in-logs.test.ts -- had `.substring` and
 * `.slice` in its SAFE list, so it treated the leak as the remedy.
 *
 * The digest answers the same operational question exactly as well: two
 * environments printing the same eight characters hold the same key, two
 * printing different ones do not. It answers nothing else, which is the point.
 * Eight hex characters is 32 bits -- ample to compare two values you already
 * have, useless to anyone who does not.
 *
 * Pair it with `.length` where the length is itself a diagnosis (a truncated
 * key is a common misconfiguration); the length is not key material.
 */
export function secretFingerprint(value: string | undefined | null): string {
  if (!value) return '<not set>'
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}
