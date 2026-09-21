/**
 * ONE ANSWER TO "IS THIS PERSON MINE?", AND ONLY ONE.
 *
 * Owner's standing rule: the super-admin sees everything, a client sees only
 * their own. Every CRM tool that accepts a `telegram_id` from its caller has to
 * apply that rule, and up to now each one applied its own copy of it -- or, in
 * three measured cases, forgot to.
 *
 * WHAT WENT WRONG WITHOUT IT
 *
 *   crm_client_plan     fixed 2026-09-20 by writing the check inline.
 *   crm_client_profile  never had it: `user_soul` and `user_skills` were read
 *                       with `WHERE telegram_id = $1` and no owner predicate,
 *                       so any seller could pass any id and receive 400
 *                       characters of that person's private SOUL plus the
 *                       names of their skills.
 *   crm_lead_context    scoped its dialog, its people row and its touches by
 *                       owner, and then called `balanceOf(pool, lead.id)` --
 *                       the one helper on the line that takes no owner -- and
 *                       returned any platform user's token balance.
 *
 * The shape is always the same: a helper called without the owner argument its
 * neighbours all pass. A rule repeated at every call site is a rule that will
 * one day disagree with itself, and here the price of disagreeing is one
 * person's private data on another person's screen. So it is written once,
 * here, and the call sites ask.
 *
 * WHAT COUNTS AS REACHABLE
 *
 *   1. Yourself. Reading your own row is not a leak.
 *   2. A keeper -- the super-admin -- sees the whole farm. `visibleScope`
 *      returns null for that role, which is the same signal `reachable()` in
 *      crm-touch-tools.ts already uses.
 *   3. Somebody you have actually corresponded with: a row in `crm_messages`
 *      under your owner_id, or a name the ingest filed for you in `crm_people`.
 *
 * Both of 3's tables are keyed by owner_id, so the question is answered inside
 * the database rather than by filtering after the fact.
 *
 * Steps 1 and 2 are exactly `canSeePerson` in src/hive/roles.ts -- self, or
 * keeper -- reached through `visibleScope`, which is that module's CRM-side
 * entry and returns null for precisely the keeper. Step 3 is the widening this
 * surface needs and that one deliberately refuses: on a CRM, "my lead" is the
 * whole subject. It does not reopen the border `canSeePerson` guards, because
 * correspondence cannot be manufactured -- both tables are written from the
 * caller's OWN dialogs, so an id picked by counting upwards still answers no.
 *
 * FAIL-CLOSED
 *
 * If the tables are missing or the query throws, the answer is "not yours".
 * The opposite choice turns one database hiccup into a leak, and this module
 * exists because that trade has already been got wrong three times.
 *
 * THE WORDING OF THE REFUSAL
 *
 * "There is no such person", not "that is not yours" -- the same choice
 * `reachable()` made, and for the same reason: a probe must not be able to
 * learn whose client somebody is by being told off.
 */
import type { ToolContext } from './tools'

/** What the caller is told, in either direction. Deliberately uninformative. */
export const NO_SUCH_PERSON = 'такого человека нет: вы с ним не переписывались' // cyrillic-ok: message shown to the agent

type Pool = ToolContext['pool']

async function hasCorrespondence(
  pool: Pool,
  owner: string,
  lead: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM crm_messages WHERE owner_id = $1 AND lead_id = $2 LIMIT 1`,
    [owner, lead]
  )
  return (r.rows ?? []).length > 0
}

async function hasPeopleRow(
  pool: Pool,
  owner: string,
  lead: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM crm_people WHERE owner_id = $1 AND lead_id = $2 LIMIT 1`,
    [owner, lead]
  )
  return (r.rows ?? []).length > 0
}

/**
 * May this caller read data filed under `lead`?
 *
 * Never throws: a broken table or a refused query answers false, because the
 * only safe direction to fail in is "no".
 */
export async function ownsLead(
  ctx: ToolContext | undefined,
  lead: string
): Promise<boolean> {
  const caller = String(ctx?.telegramId ?? '').trim()
  const target = String(lead ?? '').trim()
  if (!caller || !target) return false
  if (caller === target) return true

  // A keeper sees the whole farm; every other role is bounded by their own
  // correspondence. `null` is this codebase's existing signal for that role.
  //
  // Imported here rather than at the top of the file: crm-tools pulls the whole
  // CRM surface and its Supabase client behind it, and this module is meant to
  // be cheap enough that a tool can ask before it reads anything.
  //
  // visibleScope throws for an unidentified caller and for an owner with no
  // bots on file. Neither is a keeper, so both fall through to the
  // correspondence check below rather than ending the request.
  const scope = await import('./crm-tools')
    .then(m => m.visibleScope(ctx))
    .catch(() => [])
  if (scope === null) return true

  const pool = ctx?.pool
  if (!pool) return false
  if (await hasCorrespondence(pool, caller, target).catch(() => false))
    return true
  // The ingest files names separately from messages. A lead whose dialog has
  // been pruned but whose name row survives is still the caller's lead, and a
  // check that only read crm_messages would start refusing them.
  return hasPeopleRow(pool, caller, target).catch(() => false)
}

/**
 * The same question, as a guard. Call it BEFORE reading anything: a tool that
 * reads first and checks second surfaces as a database error rather than a
 * refusal, and `crm-owner-gate.test.ts` is built to tell those two apart.
 */
export async function requireOwnLead(
  ctx: ToolContext | undefined,
  lead: string
): Promise<void> {
  if (!(await ownsLead(ctx, lead))) throw new Error(NO_SUCH_PERSON)
}
