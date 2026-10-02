/**
 * WHAT A VISITOR DID ON THE WELCOME SCREEN -- ONE CLOSED LIST.
 *
 * The welcome screen reports each of these once per session to
 * POST /api/traffic/welcome, and render counts them per day (traffic.ts).
 * Read together they are the screen's heatmap: how many saw it, how many
 * reached the packages, and which button each of them pressed.
 *
 * One list for both sides: the app may only send what is named here, and
 * render drops anything else, so a public counter cannot grow new rows.
 */
export const WELCOME_STEPS = [
  /** The screen was shown. */
  'shown',
  /** The packages section came into view (the visitor scrolled that far). */
  'packages_seen',
  /** "Later" on the first screen: straight to the feed. */
  'skip',
  /** The language toggle. */
  'lang',
  /** A working agent's card (its dashboard). */
  'agent_open',
  /** "Talk to it" under a working agent. */
  'agent_talk',
  /** The gift section's button: spend the start tokens. */
  'gift',
  /** A package card's order button (item = package id). */
  'package_order',
  /** A package card's Stars button: the invoice was asked for (item = package id). */
  'package_buy',
  /** A package card's try button (item = package id). */
  'package_try',
  /** The pinned bar, while above the packages: the gift. */
  'pinned_gift',
  /** The pinned bar, from the packages on: order the featured package. */
  'pinned_order',
  /** The pinned bar's quiet exit to the market. */
  'market',
] as const

export type WelcomeStep = (typeof WELCOME_STEPS)[number]

export function isWelcomeStep(raw: unknown): raw is WelcomeStep {
  return (WELCOME_STEPS as readonly unknown[]).includes(raw)
}
