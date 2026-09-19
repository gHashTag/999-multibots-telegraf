/**
 * THE RENDER DID NOT ANSWER IS NOT THE RENDER SAID NO.
 *
 * `callTool` aborts its own fetch after `TOOL_TIMEOUT_MS`. That abort cancels
 * exactly one thing -- our wait. Nothing on the other side watches the socket:
 * a tool handler receives `{telegramId, pool, surface, turn}` and no signal, so
 * the work it started keeps running and finishes into a response nobody reads.
 *
 * A caller that cannot tell the two apart does the wrong thing twice: it pages
 * the owner about a failure that did not happen, and -- if it guards against
 * duplicate work -- it releases that guard and starts the same job again on top
 * of the one still running.
 *
 * Hence a type rather than a string. The message stays exactly what the owner
 * used to read; only the shape carries the distinction.
 *
 * This lives in its own module on purpose: tests mock `@/services/modelSwitch`
 * wholesale, and an `instanceof` against a mocked module's export is an
 * `instanceof undefined`.
 */
export class RenderDidNotAnswer extends Error {
  /** Duck-typed too, so a value that crossed a module mock still reads true. */
  readonly timedOut = true as const

  constructor(message: string) {
    super(message)
    this.name = 'RenderDidNotAnswer'
  }
}

/** Did the render simply take longer than we waited? */
export function renderIsStillWorking(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown } | null | undefined)?.timedOut)
}
