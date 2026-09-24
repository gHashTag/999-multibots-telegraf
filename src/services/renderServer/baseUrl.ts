/**
 * WHERE THE BOT REACHES THE RENDER (vibee-render on Railway).
 *
 * One answer for the shelf (`contentFactory/storage.ts`) and the remote render
 * client (`renderServer/client.ts`). They used to read the same variables in
 * two slightly different ways, and both broke the same day.
 *
 * WHAT BROKE, 2026-09-23
 *
 * The bot sets neither RENDER_SERVER_URL nor VIBEE_RENDER_URL, so both callers
 * fell through to RAILWAY_SERVICE_VIBEE_RENDER_URL -- a variable RAILWAY fills
 * in, not us. When the custom domain `auth.t27.ai` was added to vibee-render
 * for the refresh cookie, Railway started putting THAT host into it. On
 * `auth.t27.ai` the render answers only /api/auth/* and /health and returns
 * `404 {"error":"not found"}` for everything else (`authHostRefuses` in
 * apps/vibee-editor/render/src/auth/refresh-cookie.ts), on purpose.
 *
 * Measured in the render's http log: from 2026-09-23 07:23 UTC every
 * `POST /upload` from the bot went to auth.t27.ai and got 404, while the same
 * route on vibee-render-production.up.railway.app answered 200. Every photo,
 * video and voice note a person sent the agent was refused with "did not save
 * on our side, try again" -- and trying again could never help.
 *
 * THE RULE
 *
 * A sign-in-only host is never the render's API, whoever named it. When the
 * Railway variable names one, the render service demonstrably exists in this
 * project, so its Railway-generated domain is used instead: the same address
 * the rest of the bot already calls (hiveNote, mediaLibrary, clubCash, the
 * payment handlers), and the one that answered 200 on /upload the same day.
 * With nothing configured at all the answer is still '' -- the callers refuse
 * honestly rather than guess a host.
 */

/**
 * Hosts of the render that serve the sign-in doors and nothing else.
 *
 * Must agree with `AUTH_HOST` in the render package; a contract test reads
 * that file, so a renamed auth host cannot leave this list stale.
 */
export const SIGN_IN_ONLY_HOSTS: readonly string[] = ['auth.t27.ai']

/** vibee-render's own Railway domain in project 999 (Railway, 2026-09-24). */
export const RENDER_RAILWAY_DOMAIN =
  'https://vibee-render-production.up.railway.app'

/**
 * Scheme added, trailing slashes dropped. Railway puts a BARE host in
 * RAILWAY_SERVICE_*_URL, and `fetch` cannot parse one.
 */
function normalized(raw: string | undefined): string {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isSignInOnly(url: string): boolean {
  try {
    return SIGN_IN_ONLY_HOSTS.includes(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * The render's base URL with a scheme and no trailing slash, or '' when
 * nothing names it.
 *
 * Explicit settings first (RENDER_SERVER_URL, then VIBEE_RENDER_URL), then the
 * variable Railway fills in. A sign-in-only host is skipped wherever it comes
 * from.
 */
export function renderBaseUrl(): string {
  for (const name of ['RENDER_SERVER_URL', 'VIBEE_RENDER_URL']) {
    const url = normalized(process.env[name])
    if (url && !isSignInOnly(url)) return url
  }
  const railway = normalized(process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL)
  if (!railway) return ''
  return isSignInOnly(railway) ? RENDER_RAILWAY_DOMAIN : railway
}
