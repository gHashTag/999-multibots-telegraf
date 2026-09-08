import { describe, it, expect } from 'vitest'

/*
 * WHAT THE FIRST GENERATION WAS ON, AND WHETHER THEY CAME BACK.
 *
 *   started on a personal model     7 people, 7 came back   (100%)
 *   started on a shared model     136 people, 15 came back  (11%)
 *
 * Not one of the 121 organic people who generated exactly once had started on
 * a personal model.
 *
 * The number was wrong the first time this ran, and wrong in the direction
 * that erases the finding: the select did not carry model_type, so every row
 * read as shared and the personal group showed as ZERO. That is the third time
 * in one day a predicate has read a column nobody fetched, which is why the
 * refusal now lives in a shared helper instead of a memory.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  byFirstModel,
  isPersonalModel,
} = require('../../../scripts/first-visit.cjs')

const arrived = (id: string, at: string) => ({
  telegram_id: id,
  created_at: at,
})
const made = (id: string, at: string, model: string | null) => ({
  telegram_id: id,
  created_at: at,
  model_type: model,
})

describe('what the first generation was on', () => {
  it('tells a trained model from a catalogue one', () => {
    expect(isPersonalModel('ghashtag/lekomtsev:89e7d83f44cead9fd')).toBe(true)
    expect(isPersonalModel('neurophoto')).toBe(true)
    expect(isPersonalModel('black-forest-labs/flux-kontext-max')).toBe(false)
    expect(isPersonalModel('SeeDream-4.5')).toBe(false)
    expect(isPersonalModel(null)).toBe(false)
  })

  it('groups by the FIRST generation, not the latest', () => {
    // Somebody who starts on the catalogue and later trains a model belongs to
    // the group they started in; otherwise the measurement would credit the
    // personal model with a return it did not cause.
    const r = byFirstModel(
      [arrived('a', '2026-01-01T00:00:00Z')],
      [
        made('a', '2026-01-01T01:00:00Z', 'black-forest-labs/flux-kontext-max'),
        made('a', '2026-02-01T00:00:00Z', 'owner/a:abc123def'),
      ],
      null
    )
    expect(r.shared.people).toBe(1)
    expect(r.shared.returned).toBe(1)
    expect(r.personal.people).toBe(0)
  })

  it('counts a return as a second generation, not a second row of any kind', () => {
    const r = byFirstModel(
      [arrived('a', '2026-01-01T00:00:00Z')],
      [made('a', '2026-01-01T01:00:00Z', 'owner/a:abc123def')],
      null
    )
    expect(r.personal.people).toBe(1)
    expect(r.personal.returned).toBe(0)
  })

  it('leaves the imported cohort out, since it is measured separately', () => {
    const IMPORT = '2026-03-03T03:03:03'
    const r = byFirstModel(
      [arrived('i', IMPORT + 'Z'), arrived('o', '2026-05-05T00:00:00Z')],
      [
        made('i', '2026-03-03T04:00:00Z', 'owner/i:abc123def'),
        made('o', '2026-05-05T01:00:00Z', 'owner/o:abc123def'),
      ],
      IMPORT
    )
    expect(r.personal.people).toBe(1)
  })

  it('a generation with no timestamp is not a first generation', () => {
    const r = byFirstModel(
      [arrived('a', '2026-01-01T00:00:00Z')],
      [made('a', null as unknown as string, 'owner/a:abc123def')],
      null
    )
    expect(r.personal.people + r.shared.people).toBe(0)
  })
})
