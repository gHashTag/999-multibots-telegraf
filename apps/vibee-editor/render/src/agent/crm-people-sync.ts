/**
 * EVERY PERSON OF THE ACCOUNT IN THE CLIENT LIST, AND A SEARCH THAT FINDS THEM.
 *
 * Owner, 2026-10-09: "not all clients are visible, and the search does not
 * work -- fix it now, all contacts". Measured that day: the client list and
 * its search read crm_people only, and crm_people is filled by the ingests
 * (crm_ingest_contacts, crm_ingest_chats). Those ran by themselves only when
 * an account was connected; an account connected before the contact-book
 * import (#2945) never had its book read, and an agent-run ingest reads the
 * newest 30 dialogs. Everybody else was invisible, and so unsearchable.
 *
 * Two doors, names only -- no message is read and nothing is sent:
 *
 *   syncPeopleOnce   the contact book and the people of every dialog, in the
 *                    background, the first time the list opens in this
 *                    process for this owner;
 *   searchTelegram   a search the list could not answer asks the account
 *                    itself (contacts.Search: the owner's contacts and
 *                    dialogs, plus an exact @username), and files who it found.
 *
 * A row is keyed by the caller, as every crm_people row is: a person becomes
 * visible only to the owner whose account they came from.
 */
import type { ToolContext } from './tools'
import { client } from './telegram-tools'
import { hangUp } from './hang-up'
import { rememberPerson } from './chat-memory'
import { contactAsDialog, leadIdOf } from './crm-memory-tools'

type Pool = Parameters<typeof rememberPerson>[0]

interface UserLike {
  id?: { toString(): string }
  className?: string
  firstName?: string
  lastName?: string
  username?: string
  bot?: boolean
  self?: boolean
  deleted?: boolean
}

interface SyncClient {
  invoke: (req: unknown) => Promise<unknown>
  getDialogs?: (o: { limit: number }) => Promise<unknown[]>
  disconnect?: () => Promise<unknown>
}

/** File one Telegram user as a person of this owner; whether they were one. */
async function filePerson(
  pool: Pool,
  owner: string,
  u: UserLike
): Promise<string | null> {
  const lead = leadIdOf(contactAsDialog(u))
  if (!lead) return null
  await rememberPerson(
    pool,
    owner,
    lead,
    {
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      username: u.username ?? null,
    },
    // Names only: the list's order is the conversation's, never the sync's.
    { touch: false }
  )
  return lead
}

export interface SyncReport {
  contacts: number
  dialogs: number
  stopped: string | null
}

/**
 * The contact book, then the people of every dialog. A FLOOD_WAIT or any
 * other refusal stops that half and says where; what was filed stays.
 */
export async function syncPeople(
  ctx: ToolContext,
  open: (ctx: ToolContext) => Promise<unknown> = client,
  dialogsLimit = 2000 // t27-plumbing: GramJS pages getDialogs; the ingest's own cap
): Promise<SyncReport> {
  const owner = String(ctx.telegramId)
  const pool = ctx.pool as Pool
  const report: SyncReport = { contacts: 0, dialogs: 0, stopped: null }
  const c = (await open(ctx)) as SyncClient
  try {
    try {
      const { Api } = await import('telegram')
      const r = (await c.invoke(
        new Api.contacts.GetContacts({ hash: BigInt(0) as never })
      )) as { users?: UserLike[] }
      for (const u of r?.users ?? [])
        if (await filePerson(pool, owner, u)) report.contacts += 1
    } catch (e) {
      report.stopped = `contacts: ${String(e).slice(0, 100)}`
    }
    try {
      const dialogs = ((await c.getDialogs?.({ limit: dialogsLimit })) ??
        []) as { isUser?: boolean; entity?: UserLike }[]
      for (const d of dialogs) {
        if (!d.isUser || !d.entity) continue
        if (await filePerson(pool, owner, d.entity)) report.dialogs += 1
      }
    } catch (e) {
      report.stopped = `${report.stopped ? report.stopped + '; ' : ''}dialogs: ${String(e).slice(0, 100)}`
    }
  } finally {
    await hangUp(c as never)
  }
  return report
}

const synced = new Set<string>()

/**
 * Start the sync in the background, once per owner in this process. The list
 * answers at once with what it has; the next open shows everybody.
 */
export function syncPeopleOnce(
  ctx: ToolContext,
  run: (ctx: ToolContext) => Promise<SyncReport> = syncPeople
): boolean {
  const owner = String(ctx.telegramId ?? '')
  if (!owner || synced.has(owner)) return false
  synced.add(owner)
  void run(ctx)
    .then(r =>
      console.log(
        `[crm] people sync for ${owner}: contacts=${r.contacts} dialogs=${r.dialogs}${r.stopped ? ' stopped=' + r.stopped : ''}`
      )
    )
    .catch(e => {
      // Not connected, or the session is gone: try again on the next open.
      synced.delete(owner)
      console.warn(
        `[crm] people sync for ${owner} did not run: ${String(e).slice(0, 160)}`
      )
    })
  return true
}

/** For tests. */
export function clearPeopleSync(): void {
  synced.clear()
}

/**
 * Ask the account who matches the words: its contacts and dialogs
 * (`my_results`), and the one public account whose @username is exactly the
 * words. Everybody found is filed; their ids come back.
 */
export async function searchTelegram(
  ctx: ToolContext,
  text: string,
  limit: number,
  open: (ctx: ToolContext) => Promise<unknown> = client
): Promise<string[]> {
  const words = text.trim().replace(/^@/, '')
  if (!words) return []
  const owner = String(ctx.telegramId)
  const pool = ctx.pool as Pool
  const c = (await open(ctx)) as SyncClient
  try {
    const { Api } = await import('telegram')
    const r = (await c.invoke(
      new Api.contacts.Search({ q: words, limit })
    )) as {
      myResults?: { userId?: { toString(): string } }[]
      users?: UserLike[]
    }
    const mine = new Set(
      (r?.myResults ?? []).map(p => p.userId?.toString() ?? '')
    )
    const found: string[] = []
    for (const u of r?.users ?? []) {
      const id = u.id?.toString() ?? ''
      const exact = (u.username ?? '').toLowerCase() === words.toLowerCase()
      if (!mine.has(id) && !exact) continue
      const lead = await filePerson(pool, owner, u)
      if (lead) found.push(lead)
    }
    return found
  } finally {
    await hangUp(c as never)
  }
}
