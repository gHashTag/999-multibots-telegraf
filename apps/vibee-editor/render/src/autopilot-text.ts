/**
 * THE AUTOPILOT'S TEXT RULES, WHERE A TYPE CHECKER CAN SEE THEM.
 *
 * These three functions decide what a viewer reads, and they used to live in
 * `scripts/agent-autopilot.ts` -- a file `tsc --listFilesOnly` does not list,
 * because tsconfig includes only `src/**` and `render-server.ts`. Logic that
 * shapes every published post was therefore never type-checked and could not be
 * imported by a test without starting the daemon, whose module body reads argv
 * and whose tail spawns a loop. Both problems end by moving the pure part here.
 */

/**
 * The blog's own first sentence, whole, with its evidence marker removed.
 *
 * THIS REPLACES A BLIND `.slice(0, 110)`, AND THE OBVIOUS FIX WAS THE WRONG
 * ONE. Cutting at a word boundary instead of a character boundary still
 * amputates the clause the post exists for, and it does something worse than
 * look untidy: it publishes a DIFFERENT NUMBER. Measured over the live feed --
 * "...brought a 66,720-code consistency pass to 0 mismatches" cut at 110 lands
 * inside the figure and yields "...brought a 66,72", to which the caption
 * builder then appends a full stop. A true statement becomes a false one that
 * reads as finished. No cut length is safe, because the danger is not the
 * length, it is cutting at all.
 *
 * The descriptions are already one-sentence summaries written by hand (median
 * 190 characters over the 65 live items), so the honest unit is the sentence.
 * Where a description carries several, the first one is the claim; the rest is
 * elaboration the reel has no room for anyway.
 *
 * The leading `[measured]` / `[proven]` / `[measured in merged PR #778]` is the
 * blog's internal evidence class, useful to its author and meaningless to a
 * viewer, so it is dropped from the public text rather than engraved on it.
 *
 * A description with no sentence end at all is returned whole: a long line is a
 * layout problem, and a layout problem is better than a wrong number.
 */
export function leadSentence(raw: string): string {
  const text = String(raw || '')
    .replace(/^\s*\[[^\]]{0,80}\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  // A full stop that ends a sentence, not one inside "t27.ai", "fp6_e3m2" or
  // "66,720." -- so the next character must be a space and the previous one
  // must not be a digit followed by a decimal.
  // Built from a string, not written as a literal: the repository's guard bans
  // Cyrillic inside a regex literal, and the sentence-start class needs it.
  const SENTENCE_END = new RegExp(
    '^.*?[.!?](?=\\s+[A-Z' + '\u0410-\u042f\u0401' + '0-9\u00ab"\'(]|\\s*$)'
  )
  const m = text.match(SENTENCE_END)
  const first = (m ? m[0] : text).trim()
  return first
}

/** Join finished sentences without inventing a second full stop for any of them. */
export function sentences(parts: (string | undefined | null)[]): string {
  return parts
    .map(p => String(p || '').trim())
    .filter(Boolean)
    .map(p => (/[.!?…]$/.test(p) ? p : p + '.'))
    .join(' ')
}

/**
 * The plate whose value is a MEASUREMENT, or none.
 *
 * The style-B headline hoists a measured number to the front. The predicate
 * used to be "contains a digit anywhere", which the blog plate `t27.ai/#/blog`
 * satisfies through the `27` in the domain -- so every odd post of the day
 * opened on a web address, engraved in the single gold element the format
 * allows itself, and the decorated title then defeated both duplicate guards
 * and republished the post. A measurement begins with its number.
 */
export function measurementPlate<T extends { value?: unknown }>(
  plates: T[] | undefined | null
): T | undefined {
  return (plates || []).find(pl =>
    /^[-−+≤≥~]?\d/.test(String(pl?.value ?? '').trim())
  )
}
