/**
 * THE WIRE FIELD NAMES OF /api/providers, IN ONE PLACE.
 *
 * WHY A MAP AND NOT JUST WRITING THE KEYS. Two repo gates disagree about
 * Cyrillic object keys, and they run in PARALLEL (lefthook.yml: `parallel:
 * true`), so the disagreement is a race rather than an error:
 *
 *   - prettier --write, with quoteProps at its default, STRIPS the quotes from
 *     `'провайдеры':` and leaves a bare Cyrillic IDENTIFIER;
 *   - scripts/no-cyrillic-guard.cjs rejects exactly that -- Cyrillic outside a
 *     string literal -- and it reads the STAGED diff.
 *
 * lefthook re-stages what prettier rewrote (`stage_fixed: true`). So depending
 * on which of the two parallel commands wins, the same commit either gets
 * blocked or lands carrying identifiers the guard is supposed to forbid. The
 * first version of these fixtures wrote the keys quoted with a comment saying
 * "quoted on purpose"; prettier unquoted them on the first format pass and the
 * comment survived, still explaining a decision the file no longer implemented.
 *
 * A computed key from a string constant is stable under both: prettier has no
 * quotes to remove, and the Cyrillic sits in a string literal where the guard
 * allows it. It also puts the names the checker parses in ONE place -- which is
 * the point of scenario P06, where a renamed field is the defect under test.
 */
export const K = {
  providers: 'провайдеры',
  provider: 'провайдер',
  details: 'детали',
  working: 'работает',
  total: 'всего',
}
