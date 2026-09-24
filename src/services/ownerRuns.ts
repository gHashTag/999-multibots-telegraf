/**
 * THE TURN AN OWNER IS RUNNING, SO ANY PRESS OF HIS CAN END IT.
 *
 * Issue #2721 shipped a Stop that reaches turns the owner started from a
 * button, because the registry lived inside the handler's own closure. The
 * unattended sweep -- the one a cron starts every half hour -- runs in THIS
 * SAME PROCESS and could not be reached at all: not because it is unreachable
 * in principle, but because nothing outside that closure could see it.
 *
 * So the registry moved here, and both sides use it: the press registers the
 * turn it starts, the cron registers the turn it starts, and the Stop ends
 * whichever of them is running.
 *
 * ONE PER OWNER, and that is a claim about the system rather than a
 * convenience: `inOwnerLane` serialises a person's button turns, and the
 * sweep keeps its own `running` latch, so two turns of one owner do not
 * overlap. If that ever stops being true, this map quietly stops one of them
 * -- which is why `end` compares identity before deleting.
 *
 * IN MEMORY, DELIBERATELY. A row in a table would outlive the process it
 * describes: after a restart it would name a run that no longer exists, and a
 * Stop pressed against it would report success having stopped nothing. What
 * a restart genuinely needs -- stopping a run in ANOTHER service, with no
 * socket to close -- is a different mechanism (`stop_requested_at` in the
 * render), and pretending this map covers it would be the worse lie.
 */

const running = new Map<string, AbortController>()

/**
 * Start a turn for this owner and take its controller.
 *
 * A turn already registered for him is aborted first: it should not be
 * possible, and if it happens the old one is the abandoned one.
 */
export function beginOwnerRun(owner: string): AbortController {
  const id = String(owner ?? '').trim()
  const fresh = new AbortController()
  if (!id) return fresh
  running.get(id)?.abort()
  running.set(id, fresh)
  return fresh
}

/** The turn is over. Identity is compared: a newer turn must not be dropped. */
export function endOwnerRun(owner: string, c: AbortController): void {
  const id = String(owner ?? '').trim()
  if (id && running.get(id) === c) running.delete(id)
}

/**
 * End this owner's running turn. True when there was one.
 *
 * The caller says so either way: a button that sometimes answers and
 * sometimes does not is the one people press twice.
 */
export function stopOwnerRun(owner: string): boolean {
  const id = String(owner ?? '').trim()
  const c = id ? running.get(id) : undefined
  if (!c) return false
  c.abort()
  return true
}

/** For tests: the process-wide map must not leak between them. */
export function forgetOwnerRunsForTests(): void {
  running.clear()
}
