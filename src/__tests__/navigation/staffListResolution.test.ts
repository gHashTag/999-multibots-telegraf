import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { HAIM_GROUP_STAFF_IDS } from '@/navigation'

/**
 * HAIM_GROUP_STAFF_IDS is defined three times, and one of the three is
 * placeholder data that was never replaced:
 *
 *   src/navigation/config/access.config.ts:12       5 real ids
 *   src/navigation/unified-navigation.config.ts:438 6 real ids
 *   src/navigation/constants/access.ts:6            ['123456789', '987654321']
 *                                                   commented as an example
 *
 * The barrel re-exports two of them. src/navigation/index.ts has
 * `export * from './config/access.config'` on one line and
 * `export * from './constants/access'` on another, plus an explicit
 * `export { HAIM_GROUP_STAFF_IDS } from './config/access.config'` further down.
 *
 * This is live. getActiveUserModelsByTypeForHaim and getLatestUserModelForHaim
 * both import the name from '@/navigation' and gate on
 * `HAIM_GROUP_STAFF_IDS.includes(telegram_id)`.
 *
 * Which copy wins was measured, not reasoned about, on a fixture with the same
 * shape run through this project's own toolchain:
 *
 *   two stars + explicit re-export  -> the explicit one
 *   two stars, config first         -> config (first star wins)
 *   two stars, constants first      -> THE PLACEHOLDER
 *
 * So two separate things keep production on the real list, and both are
 * positional: the explicit re-export, and the order of two `export *` lines.
 * Reordering imports is the most routine edit there is -- an alphabetiser or a
 * lint autofix does it -- and it would swap the staff list without touching a
 * single id. Five real staff would lose access, and whoever holds telegram id
 * 123456789 would gain it.
 *
 * Hence a value assertion rather than a structural one: whatever anyone
 * rearranges, this reads what production actually receives.
 *
 * The fix is to delete the placeholder definition, which cannot change today's
 * behaviour because the name is already shadowed. That is someone else's file,
 * so it is written up for the owner instead of done here.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const PLACEHOLDER_IDS = ['123456789', '987654321']

describe('the staff list production receives', () => {
  it('is the real list, not the placeholder one', () => {
    expect(HAIM_GROUP_STAFF_IDS).toEqual([
      '144022504',
      '289259562',
      '752224685',
      '7669741878',
      '1036512726',
    ])
  })

  it('contains no placeholder id', () => {
    // Stated separately from the list above: if the ids are ever legitimately
    // changed, that expectation gets updated and this one must still hold.
    for (const fake of PLACEHOLDER_IDS) {
      expect(HAIM_GROUP_STAFF_IDS).not.toContain(fake)
    }
  })

  it('still has a competing definition, so this test still has a subject', () => {
    // The control. If the placeholder file were cleaned up, the two checks
    // above would keep passing while guarding nothing, and nobody would know
    // this file had become decorative.
    const placeholder = read('src/navigation/constants/access.ts')
    expect(placeholder).toContain('HAIM_GROUP_STAFF_IDS')
    expect(placeholder).toContain(PLACEHOLDER_IDS[0])

    const barrel = read('src/navigation/index.ts')
    expect(barrel).toMatch(/export\s*\*\s*from\s*['"]\.\/constants\/access['"]/)
  })
})
