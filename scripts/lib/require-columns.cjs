/**
 * A filter over a column that was never selected matches nothing -- or, if the
 * predicate is a negation, everything. Both look like an answer.
 *
 * This happened three times in one day, in three different probes, and each
 * time the wrong number was published or nearly published:
 *
 *   - a dashboard audit read inv_id and operation_id without selecting them:
 *     `!r.inv_id` was true for every row, so 1719 credits looked undedupable
 *     instead of 418. The tell was that 1719 is exactly the number of credits.
 *   - a lapsed-payer census read is_test and description without selecting
 *     them: every seeded credit counted as real money, 757112 stars instead of
 *     143788, while the line beside it said the seeding had been removed.
 *   - a first-visit measurement read model_type without selecting it: every
 *     first generation looked like a shared model, so "7 of 7 came back"
 *     became "0 personal models exist".
 *
 * Remembering to select the column is not a fix; it failed three times. This
 * is: ask the rows whether the field arrived, and refuse to report if it did
 * not. A probe that cannot see its subject has not found a clean subject.
 */
function requireColumns(rows, needed, what = 'these rows') {
  if (!Array.isArray(rows) || rows.length === 0) return
  const present = new Set(Object.keys(rows[0]))
  const absent = needed.filter(c => !present.has(c))
  if (absent.length) {
    console.error(
      `cannot judge ${what} without: ${absent.join(', ')}\n` +
        `the select does not carry them, so every predicate reading them sees undefined.\n` +
        `Refusing to report rather than printing a number produced by a blind filter.`
    )
    process.exit(2)
  }
}

module.exports = { requireColumns }
