import { atom } from 'jotai'

/**
 * "AN AGENT IS WORKING IN YOUR BROWSER RIGHT NOW."
 *
 * The screen glows while this is true, so it has to be true. What the app can
 * honestly know today is one thing: a browser session appeared that THIS
 * SCREEN did not start. Somebody else started it -- the bot, a seller thread,
 * a developer's console -- and the watcher switched the person to it.
 *
 * WHAT IT DOES NOT KNOW, said plainly so the glow is never oversold: whether
 * the agent is clicking at this exact second. There is no per-action signal
 * yet; it arrives with the MCP facade over CDP, and then this can follow real
 * activity instead of "started by somebody else". Until then the glow means
 * "running, and not yours to begin with", and it is turned off the moment the
 * person touches the browser -- from then on they are the one driving.
 */
export const agentWorkingAtom = atom(false)
