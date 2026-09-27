#!/usr/bin/env node
/**
 * The player's type errors: the count may only fall. The ratchet mechanics and
 * the three counting traps live in scripts/lib/tsc-ratchet.cjs; this file is
 * only the settings.
 */

const { ratchet } = require('./lib/tsc-ratchet.cjs')

/**
 * The baseline. Lower it along with the fixes -- the script reminds you.
 *
 * 2026-08-28: 14 -> 12. Twenty-seven errors went at once when jotai stopped
 * being installed TWICE: the vibee-atoms package had its own 2.20.3, the
 * player 2.16.0. Atoms were built with one version's types and useAtom read
 * them with another's -- so the setter inferred as `never`.
 */
const BASELINE = 0

ratchet({
  label: 'в плеере',
  dir: 'apps/vibee-editor/player',
  project: 'tsconfig.app.json',
  baseline: BASELINE,
  scope: ['apps/vibee-editor/player', 'apps/vibee-editor/packages'],
  self: 'scripts/check-player-types.cjs',
  lesson:
    'За прошлыми такими скрывались ReferenceError в синке профиля и молча\n' +
    '   стёртое поле в схеме субтитров.',
})
