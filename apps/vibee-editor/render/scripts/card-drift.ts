/**
 * The verb for tonight's drift (spec kanban-card-chat.t27 v5):
 *
 *   npx tsx scripts/card-drift.ts <drifted 0|1> <issue-open 0|1>
 *
 * Prints none | open | comment | close. `tri card-drift` acts on it with
 * `gh`; the decision lives here so the spec's test binds it.
 */
import { DRIFT_VERBS, driftAction } from '../src/hive/card-drift'

const [drifted, open] = process.argv.slice(2)
console.log(DRIFT_VERBS[driftAction(drifted === '1', open === '1')])
