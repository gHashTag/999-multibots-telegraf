/**
 * Ratchet: no two scenes may share a scene id (#1345, follow-up to #1344).
 *
 * Telegraf's Scenes.Stage is a last-writer-wins Map keyed by scene id. Two
 * scenes registered with the SAME id -> the later one silently SHADOWS the
 * earlier. That is exactly how neuroPhotoWizardV2 (id 'neuro_photo') shadowed
 * the guarded V1 and became the live-but-unguarded mainstream paid path, causing
 * the #1342/#1343 double-charge. Nothing tested for duplicate ids.
 *
 * This imports every exported scene from the @/scenes barrel and asserts their
 * ids are unique, except a documented ALLOWLIST. A stale-allowlist check forces
 * each allowlist entry to be removed once its id is no longer a duplicate.
 */
import { describe, it, expect } from 'vitest'
import * as scenes from '@/scenes'

// scene id -> why it is (still) a known duplicate. Remove an entry once fixed.
const ALLOWLIST: Record<string, string> = {
  // V1 neuroPhotoWizard is shadowed by neuroPhotoWizardV2 (both id 'neuro_photo').
  // V2 is the live path and IS guarded/tested (#1343). V1 is dead code; delete it
  // to clear this entry. Tracked in #1344.
  neuro_photo: '#1344: V1 neuroPhotoWizard shadowed by V2; delete V1 to clear',
  // V1 neuroPhotoWizard is shadowed by neuroPhotoWizardV2 (both id 'neuro_photo').
  // V2 is the live path and IS guarded/tested (#1343). V1 is dead code; delete it
  // to clear this entry. Tracked in #1344.
}

function sceneIds(): string[] {
  return Object.values(scenes as Record<string, unknown>)
    .filter(
      (s): s is { id: string } =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as any).id === 'string' &&
        typeof (s as any).middleware === 'function'
    )
    .map(s => s.id)
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    seen.add(id)
  }
  return [...dups]
}

describe('scene ids are unique (no silent Stage shadowing)', () => {
  it('collects a non-trivial number of scenes (barrel import works)', () => {
    expect(sceneIds().length).toBeGreaterThan(20)
  })

  it('no duplicate scene id outside the documented allowlist', () => {
    const dups = duplicateIds(sceneIds())
    const unexpected = dups.filter(id => !(id in ALLOWLIST))
    expect(
      unexpected,
      `duplicate scene ids (two scenes with the same id -> the later shadows the earlier):\n${unexpected.join('\n')}`
    ).toEqual([])
  })

  it('allowlist has no stale entries (each must still be a real duplicate)', () => {
    const dups = new Set(duplicateIds(sceneIds()))
    const stale = Object.keys(ALLOWLIST).filter(id => !dups.has(id))
    expect(
      stale,
      `these ids are no longer duplicated — remove them from ALLOWLIST:\n${stale.join('\n')}`
    ).toEqual([])
  })
})
