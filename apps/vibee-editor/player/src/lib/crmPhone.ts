/**
 * THE CRM ON A PHONE: WHERE THE WORK TAB SPENDS ITS FIRST SCREEN (P31).
 *
 * Measured with `tri shot crm` at 390x844, 07.10.2026: the first person
 * waiting for an answer ended at 926 px and their Prepare at 1065 px, under
 * a tab bar that starts at 787. Everything above them is now a way to
 * someone (the search), a count read at a glance (the funnel), or a
 * switch's state -- and each switch takes one line.
 */

/** The page's own phone width (Crm.css lays the rows out for it too). */
export const CRM_PHONE_QUERY = '(max-width: 480px)'

/**
 * THE AUTO SWITCH, OFF, IS ONE LINE ON A PHONE.
 *
 * The biggest thing above the first person was this panel, about 220 px:
 * a state line, two scope chips, the switch and a hint -- for a switch that
 * was OFF, the state in which nothing leaves without the owner's press.
 *
 * So the panel is sized by what the switch is doing, not by what it could
 * do. Off, on a phone, it folds to its name and the word "off", one press
 * from the whole panel. On, it is never folded: that is the state that
 * writes to people by itself, and its stop button stays in plain sight.
 * A switch whose state could not be read is not folded either: it says so
 * at full size (AutoPanel: AN UNREADABLE SWITCH SAYS SO).
 *
 * The scope is chosen before the switch is turned on, so the folded line
 * carries no "turn on": a press there would send to everyone unseen.
 */
export function autoFolds(
  phone: boolean,
  reachable: boolean,
  on: boolean
): boolean {
  return phone && reachable && !on
}
