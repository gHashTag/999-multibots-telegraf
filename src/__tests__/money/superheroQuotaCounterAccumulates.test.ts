/**
 * Ratchet: incrementSuperheroGeneration's fallback ACCUMULATES the monthly count
 * (read existing, write existing+1) -- it must not use `.upsert()` with a static
 * count, which OVERWRITES instead of incrementing.
 *
 * checkSuperheroGenerationUsage enforces maxUsage=3 free superhero generations per
 * month via generation_count (currentUsage < 3). The fallback used
 * `.upsert({ generation_count: 1 }, { onConflict })` then read that just-written 1
 * and set it to 1+1=2 -- supabase upsert OVERWRITES the conflicting row (it does
 * not increment), so the monthly count was stuck at 2 forever and the 3/month cap
 * NEVER triggered: unlimited free superhero generations (the RPC
 * increment_superhero_generation_count has no migration, so this fallback is the
 * live path). Found by the iter249 upsert-onConflict audit.
 *
 * This pins: the counter reads the existing value and writes existing+1, and the
 * file does not upsert the counter. floor + self-check + real-source mutation.
 *
 * loop-fable iter249.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../core/supabase/incrementSuperheroGeneration.ts'
)

/** Does the fallback accumulate (read existing + write existing+1, no upsert)? */
function accumulates(source: string): boolean {
  return (
    /existing\.generation_count \+ 1/.test(source) &&
    /maybeSingle\(\)/.test(source) &&
    !/\.upsert\(/.test(source)
  )
}

describe('superhero generation quota counter accumulates (no upsert-overwrite)', () => {
  const source = fs.readFileSync(FILE, 'utf8')

  it('floor: the file still increments generation_count', () => {
    expect(/generation_count/.test(source)).toBe(true)
  })

  it('the fallback reads existing and writes existing+1 (no upsert-overwrite)', () => {
    expect(
      accumulates(source),
      `incrementSuperheroGeneration's fallback does not accumulate the count. A ` +
        `.upsert({ generation_count: 1 }) OVERWRITES the row instead of ` +
        `incrementing, so the monthly count sticks and the 3/month free cap is ` +
        `bypassed. Read the existing count and write existing+1.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes accumulate from upsert-overwrite', () => {
    const good = `const {data: existing} = await s.from('t').select('generation_count').maybeSingle(); await s.update({ generation_count: existing.generation_count + 1 })`
    const bad = `await s.from('t').upsert({ generation_count: 1 }, {onConflict:'x'}).select().single()`
    expect(accumulates(good)).toBe(true)
    expect(accumulates(bad)).toBe(false)
  })

  it('mutation: breaking the existing+1 increment turns the check RED', () => {
    const mutated = source.replace(/existing\.generation_count \+ 1/, '1')
    expect(mutated).not.toEqual(source)
    expect(accumulates(mutated)).toBe(false)
  })
})
