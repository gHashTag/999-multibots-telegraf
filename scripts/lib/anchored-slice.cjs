/**
 * A REGION OF SOURCE, OR A LOUD FAILURE -- NEVER THE LAST CHARACTER.
 *
 * `src.slice(src.indexOf(needle))` looks like "the text from here on". When the
 * needle is absent, indexOf returns -1 and slice(-1) returns THE LAST CHARACTER
 * of the file. A positive assertion then fails with something unreadable --
 *
 *     expected '\n' to contain 'await creditStarsPayment(pool, {'
 *
 * -- which is what happened on a clean tree the day #2226 reformatted an SQL
 * statement so that `UPDATE token_invoices` and `SET redeemed` landed on
 * different lines. The production code was right; only the anchor was gone.
 *
 * THE DANGEROUS HALF IS THE OTHER DIRECTION. A NEGATIVE assertion over that
 * same '\n' passes, vacuously and for ever: `expect(region).not.toContain('INSERT
 * INTO star_payments')` would go green on a file that no longer contains the
 * region at all. A guard that cannot see its subject reports no violations.
 *
 * So a missing anchor is an error here, not a silent empty string, and the
 * message names the anchor so the fix is one grep.
 */

/**
 * @param {string} src   the whole file
 * @param {string} needle  the anchor text
 * @param {number} [length]  how much to take; to the end when omitted
 * @returns {string}
 */
function sliceFrom(src, needle, length) {
  const at = String(src).indexOf(needle)
  if (at === -1)
    throw new Error(
      `anchor not found: ${JSON.stringify(needle)} — the code moved or was ` +
        `reformatted; re-anchor the check rather than deleting it`
    )
  return length === undefined ? src.slice(at) : src.slice(at, at + length)
}

/** Between two anchors; the second is optional and falls back to the end. */
function sliceBetween(src, from, to) {
  const region = sliceFrom(src, from)
  const end = region.indexOf(to, from.length)
  return end === -1 ? region : region.slice(0, end)
}

module.exports = { sliceFrom, sliceBetween }
