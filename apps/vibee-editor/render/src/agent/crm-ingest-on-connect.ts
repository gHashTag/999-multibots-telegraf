/**
 * THE MEMORY STARTS THE MOMENT THE ACCOUNT IS CONNECTED.
 *
 * Until now the correspondence reached the memory only when somebody asked
 * for an ingest or the half-hour sweep ran. An owner who had just connected
 * their Telegram and opened a client's DM was answered by an agent that knew
 * nothing of a year of conversation. So the ingest runs by itself, right
 * after the session is saved: every dialog the account has, deep, into Postgres and Zep.
 *
 * Fire-and-forget: the connect route answers at once; the walk over dozens
 * of dialogs takes minutes and its failure is logged, not shown -- the
 * session is saved either way, and the sweep will try again.
 */

type Pool = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export interface IngestReport {
  /** Contact-book names filed before the dialog walk (#2945). */
  contacts?: number
  people?: number
  messages_new?: number
  zep_mirrored?: number
  stopped?: string | null
}

async function runIngest(
  pool: Pool,
  telegramId: string
): Promise<IngestReport> {
  const { CRM_MEMORY_TOOLS } = await import('./crm-memory-tools')
  const tool = CRM_MEMORY_TOOLS.find(t => t.name === 'crm_ingest_chats')
  if (!tool) throw new Error('crm_ingest_chats is not registered')
  const ctx = { telegramId, pool, surface: 'bot', turn: 'connect' } as never
  /*
   * The contact book first (#2945): it reads names only, so it is quick,
   * and it is how a contact with no recent dialog reaches the CRM at all.
   * Its failure must not cost the dialog walk.
   */
  const book = CRM_MEMORY_TOOLS.find(t => t.name === 'crm_ingest_contacts')
  const contacts = book
    ? ((await book.handler({}, ctx).catch(() => null)) as {
        people?: number
      } | null)
    : null
  const r = (await tool.handler(
    { limit: 2000, depth: 500 },
    ctx
  )) as IngestReport
  return { ...r, contacts: contacts?.people }
}

export async function ingestAfterConnect(
  pool: Pool,
  telegramId: string,
  run: (pool: Pool, telegramId: string) => Promise<IngestReport> = runIngest
): Promise<IngestReport | null> {
  try {
    const r = await run(pool, telegramId)
    console.log(
      `[crm] ingest after connect for ${telegramId}: contacts=${r.contacts ?? '?'} people=${r.people ?? '?'} new=${r.messages_new ?? '?'} zep=${r.zep_mirrored ?? '?'}${r.stopped ? ' stopped=' + r.stopped : ''}`
    )
    return r
  } catch (e) {
    console.warn(
      `[crm] ingest after connect failed for ${telegramId}: ${String(e).slice(0, 160)}`
    )
    return null
  }
}
