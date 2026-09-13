/**
 * WHO SELLS HERE. One reading tool for the platform owner (and for the bot,
 * which calls the render as the owner before its proactive sweep): every
 * person with a connected Telegram account, and -- only when asked -- whether
 * each session still passes Telegram's checkAuthorization.
 *
 * Measured 2026-09-13 on the render's Postgres: tg_sessions held two rows,
 * 144022504 (@t27_dev, the owner) and 435572800 (@playom). Both accounts had
 * done the login in the app days earlier; what kept the second one out of the
 * CRM was `requireOwner` alone. Spec: t27 specs/automation/crm-sellers.t27.
 *
 * What this tool never returns: the session string, or any prefix of it. A
 * row is reduced to the id, when it was connected, and (probed) alive/dead.
 * The probe opens a real client per seller and hangs up in `finally`; it is
 * off by default because it costs one MTProto round trip per row.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireOwner, listSellers, client } from './telegram-tools'

export interface SellerRow {
  telegram_id: string
  connected_at: string | null
  is_owner: boolean
  /** Only when probe=true: did checkAuthorization pass. */
  alive?: boolean
  /** Only when probe=true and the client refused: the reason, no secrets. */
  error?: string
}

/** Sellers as the bot's sweep wants them: ids only, most recent first. */
export function sellerIds(rows: SellerRow[]): string[] {
  return rows.map(r => r.telegram_id).filter(Boolean)
}

export async function probeSeller(
  ctx: ToolContext | undefined,
  telegramId: string
): Promise<{ alive: boolean; error?: string }> {
  // `client()` already runs checkAuthorization and throws with a human
  // reason when the session is dead; a returned client means alive.
  const asSeller = { ...(ctx ?? {}), telegramId } as ToolContext
  try {
    const c = (await client(asSeller)) as {
      disconnect?: () => Promise<void>
      destroy?: () => Promise<void>
    }
    try {
      await c.disconnect?.()
      await c.destroy?.()
    } catch {
      // Hang-up is best-effort; the answer is already known.
    }
    return { alive: true }
  } catch (e) {
    return { alive: false, error: String((e as Error)?.message ?? e).slice(0, 200) }
  }
}

export const CRM_SELLERS_TOOLS: AgentTool[] = [
  {
    name: 'crm_sellers',
    description:
      'Кто подключил свой Telegram-аккаунт к CRM (список продавцов): telegram_id и дата ' +
      'подключения. С probe=true — жива ли сессия каждого. Только для владельца платформы. ' +
      'ЧИТАЮЩИЙ инструмент; строки сессий не возвращает.',
    parameters: {
      type: 'object',
      properties: {
        probe: {
          type: 'boolean',
          description:
            'проверить каждую сессию живым запросом к Telegram (по умолчанию false)',
        },
      },
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      const pool = ctx?.pool as
        | { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }
        | undefined
      if (!pool) throw new Error('база недоступна: список продавцов не прочитать')
      const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
      const rows: SellerRow[] = (await listSellers(pool)).map(r => ({
        ...r,
        is_owner: r.telegram_id === OWNER_TELEGRAM_ID,
      }))
      if (a?.probe === true) {
        // Sequentially: one MTProto connection at a time on the render.
        for (const r of rows) {
          const p = await probeSeller(ctx, r.telegram_id)
          r.alive = p.alive
          if (p.error) r.error = p.error
        }
      }
      return {
        sellers: rows,
        count: rows.length,
        probed: a?.probe === true,
        note:
          'Продавец — тот, у кого подключён свой аккаунт; CRM работает от его имени и ' +
          'видит только его данные. Строки сессий этот инструмент не отдаёт.',
      }
    },
  },
]
