/**
 * Shift ONLY "now", leaving written dates alone.
 *
 * A test with a calendar date in its fixture and a real clock is a timer
 * (form 33). One such date, 2026-09-16, turned main red and blocked every
 * push in the repository. The only way to find the rest is to run the suite
 * as if N days had passed and see what falls over.
 *
 * `new Date()` with no arguments and `Date.now()` move forward;
 * `new Date('...')` stays as written -- otherwise the fixtures would move
 * along with the clock and there would be nothing to catch.
 */
const days = Number(process.env.CLOCK_SHIFT_DAYS || 0)
if (days) {
  /*
   * AND CHILD PROCESSES TOO.
   *
   * The first version shifted the clock inside the vitest process only, and
   * two tests spawn the script under test: the fixture was written with the
   * shifted today and the child compared it against the real one. Two green
   * tests looked like they would die tomorrow, and I nearly reported that.
   * A tool that cries wolf is worse than no tool -- a rule written by this
   * same hand a week earlier.
   *
   * `--import` pulls this file into every child node; the variable is
   * already in the environment, so the condition holds there as well.
   */
  const self = new URL(import.meta.url).pathname
  const add = `--import ${self}`
  if (!String(process.env.NODE_OPTIONS || '').includes(self)) {
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${add}`.trim()
  }
  const ms = days * 86400000
  const RealDate = Date
  class Shifted extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + ms)
      else super(...args)
    }
    static now() {
      return RealDate.now() + ms
    }
  }
  globalThis.Date = Shifted
}
