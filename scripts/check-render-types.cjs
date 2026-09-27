#!/usr/bin/env node
/**
 * The RENDER's type errors -- render being the service that IS production.
 *
 * WHY THIS GATE EXISTS AT ALL (2026-09-27). The root type check in lefthook
 * excludes `^apps/` wholesale; the player had a gate of its own; render had
 * none. Caught on our own edit: the field `PodSweep.telegramId` was renamed to
 * `who`, the log line in render-server.ts kept reading the old name, every gate
 * went green, and the log would have printed `undefined` for the pod's name.
 * The deploy would have gone out in silence.
 *
 * Ratchet mechanics and the three counting traps: scripts/lib/tsc-ratchet.cjs.
 */

const { ratchet } = require('./lib/tsc-ratchet.cjs')

/**
 * The baseline -- zero, and it holds: measured 2026-09-27, render has no errors
 * of its own. The one error in the program sits in the sibling package
 * vibee-atoms (where `react` resolves from the root node_modules, which has no
 * @types/react) and is filtered out below: somebody else's debt would break
 * this gate, and a gate that fails for no reason of yours gets removed.
 */
const BASELINE = 0

ratchet({
  label: 'в рендере',
  dir: 'apps/vibee-editor/render',
  project: 'tsconfig.json',
  baseline: BASELINE,
  scope: ['apps/vibee-editor/render'],
  self: 'scripts/check-render-types.cjs',
  /* tsc paths are relative to render: ours never start with `../`. */
  mine: file => !file.startsWith('../'),
  lesson:
    'Прошлая такая ошибка — переименованное поле, из-за которого в логе\n' +
    '   пода печаталось бы undefined, а все гейты были зелёными.',
})
