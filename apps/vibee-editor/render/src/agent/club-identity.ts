import type { IncomingMessage } from 'http'
import { hasServerKey, verifiedTelegramId } from '../../auth'
import { chatIdentity } from './routes'
import { clubCaller } from './club-membership'

/**
 * WHOSE CLUB A REQUEST TO /api/club/* IS ABOUT -- THE ONE DECISION THE SERVER USES.
 *
 * The person by their own proof (Mini App signature, app session, agent key),
 * or the bot acting for somebody: the server key plus `?telegram_id=`.
 *
 * WHY `hasServerKey` AND NOT `authenticate(req).via === 'api-key'`. The club
 * paths are PUBLIC_EXACT in auth.ts (they check identity themselves), and
 * `authenticate` answers `via: 'public'` for a public path BEFORE it looks at
 * any key. So on these paths `via === 'api-key'` is never true, and that is
 * how the bot's route into the club shipped closed: every Join press got 401
 * from /api/club/invoice, /api/club/status answered the anonymous price to
 * members and owners alike, and /api/club/verify refused to book a charge
 * (reproduced 2026-09-22 with the real key and ?telegram_id=900000061).
 * auth.ts documents the same trap on /api/agent/chat (see `hasServerKey`).
 *
 * This lives in its own module, not inline in render-server.ts, so the exact
 * function the server hands to `handleClub` can be run by a test with a real
 * request -- an inline closure could only be checked by reading its text,
 * which is how the broken check was pinned green.
 */
export function clubIdentity(req: IncomingMessage): string | null {
  return clubCaller(
    req,
    chatIdentity(req, verifiedTelegramId(req)),
    hasServerKey(req)
  )
}
