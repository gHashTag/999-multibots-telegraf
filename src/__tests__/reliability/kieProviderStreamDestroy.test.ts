/**
 * Regression: the kie lipsync provider must not abandon success-path
 * availability-check streams (#1334).
 *
 * KieVeedFabricProvider.generate() checks image/audio URL availability with
 * axios.get(url, { responseType: 'stream' }). On the SUCCESS path it only reads
 * headers; the socket-backed Readable must be .destroy()ed, or a later
 * ECONNRESET/timeout emits 'error' with no listener -> uncaughtException ->
 * process.exit(1) (errorHandler.ts:181) kills the single process running ALL
 * bots. The two FALLBACK GET branches already destroy; only the success
 * branches had omitted it.
 *
 * This file's streams are ALL header-only availability checks, so the invariant
 * is exact: every responseType:'stream' GET must have a matching .data.destroy().
 * (A real streaming DOWNLOAD would pipe/pipeline instead and this rule would be
 * relaxed then.) Integration-heavy provider -> structural guard, mutation-tested.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(
  join(process.cwd(), 'src/core/lipsync/providers/kie-veed-fabric-provider.ts'),
  'utf8'
)

describe('kie provider: availability-check streams are destroyed', () => {
  it('destroys both success-path streams (image + audio)', () => {
    expect(SRC).toContain('imageResponse.data?.destroy?.()')
    expect(SRC).toContain('audioResponse.data?.destroy?.()')
  })

  it('every responseType:stream GET has a matching .data.destroy()', () => {
    const gets = (SRC.match(/responseType: 'stream'/g) || []).length
    const destroys = (SRC.match(/\.data\??\.destroy/g) || []).length
    expect(gets).toBeGreaterThan(0)
    // no abandoned availability-check stream in this file
    expect(destroys).toBeGreaterThanOrEqual(gets)
  })
})
