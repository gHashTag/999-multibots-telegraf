/**
 * HANG UP FOR REAL: destroy(), not disconnect().
 *
 * Measured 2026-09-13 on vibee-render: ~21 `Error: TIMEOUT` lines a minute
 * from telegram/client/updates.js, hours after every tool call had returned.
 * gramjs 2.26: `connect()` starts `_updateLoop`, which runs
 * `while (!client._destroyed)` and pings the sender every nine seconds.
 * `disconnect()` closes the socket but never sets `_destroyed`, so the loop
 * outlives the call: every ping times out, is logged with console.error, and
 * `_sender.reconnect()` reopens the socket we just closed. One zombie loop
 * per call, for the life of the process. `destroy()` sets the flag first,
 * then disconnects. Fakes in tests may have only `disconnect` -- that is
 * still honoured.
 */
export async function hangUp(
  c:
    | { destroy?: () => Promise<unknown>; disconnect?: () => Promise<unknown> }
    | null
    | undefined
): Promise<void> {
  if (!c) return
  try {
    if (typeof c.destroy === 'function') await c.destroy()
    else if (typeof c.disconnect === 'function') await c.disconnect()
  } catch {
    // The socket is Telegram's problem now; the answer (or the error) is ours.
  }
}
