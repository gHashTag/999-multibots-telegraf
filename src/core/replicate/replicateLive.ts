/**
 * REPLICATE IS OFF FOR THE BOT TOO. KIE IS THE PROVIDER.
 *
 * Owner, 2026-10-02: no balance on Replicate, the platform runs on Kie. The
 * render service already asks `replicateLive()` before every Replicate call
 * (apps/vibee-editor/render/src/replicate-off.ts); this is the same switch for
 * the bot, on the same variable, so one `REPLICATE_LIVE=1` turns both back on.
 *
 * Why it exists: `REPLICATE_API_TOKEN` is still set on the bot's service, and
 * "token is set" used to mean "use Replicate". On 2026-10-11 every business DM
 * reply failed with "re-enable your account" because chat went straight there.
 * A token being present is not a balance.
 */
export function replicateLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPLICATE_LIVE === '1' && Boolean(env.REPLICATE_API_TOKEN)
}
