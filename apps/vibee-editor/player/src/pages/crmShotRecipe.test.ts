import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * TRI SHOT KNOWS THE RECIPE /crm HIDES ITS AUTO WORD WITH.
 *
 * crmInsets.test pins that `.crm__auto-word` is clipped with `inset(50%)` on a
 * phone; this pins that tri shot treats that recipe as hidden on purpose, not
 * as a word cut "33>1" in every row.
 *
 * shot.mjs lives in the repository's bin/, which the player's Docker build
 * context (apps/vibee-editor) cannot contain -- so this file is in the deploy
 * gate's EXCLUDE (scripts/test-gate.mjs) and runs in the repository's hooks.
 * It was a line inside crmInsets.test until that line failed the deploy of
 * #3244 with ENOENT.
 */

describe('tri shot and the AUTO word', () => {
  it('counts a clip-path inset(50%) as hidden on purpose', () => {
    const shot = fs.readFileSync(
      path.join(__dirname, '../../../../../bin/helpers/shot.mjs'),
      'utf8'
    )
    expect(shot).toContain("s.clipPath === 'inset(50%)'")
  })
})

describe('tri shot and the CRM search', () => {
  /*
   * /crm has two search fields. The work section's `.crm__find` hands its
   * focus to the contacts section and unmounts; a recipe aiming at any
   * `input[type=search]` caught it mid-switch and the search state was NOT
   * MEASURED at 320px, three times in three (#3359). The recipe types into
   * the contacts box, and the contacts box must still be called that.
   */
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, rel), 'utf8')

  it('types into the contacts box, not the field that leaves', () => {
    const shot = read('../../../../../bin/helpers/shot.mjs')
    expect(shot).toContain('.crm__finder input[type=search]')
    expect(shot).not.toContain("p.locator('.crm input[type=search]')")
  })

  it('finds the contacts box under the name the recipe uses', () => {
    expect(read('./Crm.tsx')).toContain('className="crm__finder"')
  })
})
