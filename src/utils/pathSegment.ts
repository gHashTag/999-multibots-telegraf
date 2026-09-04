/**
 * An identifier used as a DIRECTORY NAME must not be able to leave the
 * directory it is placed in.
 *
 * Four call sites build an upload or temp path from a telegram_id typed as
 * `string`, and `path.join` resolves `..` rather than rejecting it, so
 *
 *   path.join(__dirname, '../uploads', telegram_id)
 *
 * with a telegram_id of `../../etc` writes outside uploads entirely. Two of
 * those four sites wrap the value in String() or .toString(), which is a no-op
 * on a value that is already a string and sanitises nothing.
 *
 * The check rejects only what makes traversal possible -- separators, `..`,
 * NUL, and the empty string -- rather than demanding digits. Telegram ids are
 * numeric, but these helpers are called from many places and a digits-only
 * rule would refuse identifiers that are legitimate and harmless. Refusing the
 * narrower thing is what keeps this additive.
 */
export function assertSafePathSegment(
  value: string,
  what = 'path segment'
): void {
  const bad =
    value === '' ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  if (bad) {
    throw new Error(
      `Refusing to use an unsafe ${what} as a directory name: ${JSON.stringify(value)}`
    )
  }
}
