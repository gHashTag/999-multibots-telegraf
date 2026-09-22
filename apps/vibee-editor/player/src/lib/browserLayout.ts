/**
 * HOW THE LIVE BROWSER IS LAID OUT -- MINIMAL BY DEFAULT.
 *
 * Owner, 2026-09-22: "minimalism by default: the browser on the whole
 * screen, with no interface; the controls are frosted glass over it, like
 * our site; flexible for any size". So a live browser that can be shown
 * here covers the app at every size -- phone, tablet, desktop -- and its
 * controls live in one glass sheet over the picture (components/DetentSheet),
 * closed to a single line until something needs the person.
 *
 * `?view=classic` is the old page -- title, picture, buttons under it -- for
 * somebody who wants the app's tab bar back. It is a history entry, so Back
 * returns to the minimal view. `?view=full`, the old full-screen address, is
 * the minimal view now: links sent before still land where they meant to.
 */
export type BrowserLayout = 'minimal' | 'sheet' | 'flow'

export const CLASSIC_VIEW = 'classic'

/** Pure. `view` is the address's ?view= value. */
export function browserLayout(input: {
  embedded: boolean
  phone: boolean
  view: string | null
}): BrowserLayout {
  if (!input.embedded) return 'flow'
  if (input.view !== CLASSIC_VIEW) return 'minimal'
  return input.phone ? 'sheet' : 'flow'
}
