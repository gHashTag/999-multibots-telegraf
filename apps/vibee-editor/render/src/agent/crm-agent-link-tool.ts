/**
 * LINK A CONNECTED SELLER TO HER EDITORIAL AGENT IN THE LEELA BOT.
 *
 * The Leela bot (@leela_chakra_ai_bot, repo gHashTag/leela) grants its
 * content-administrator role through a two-person handshake: the claimant
 * sends /agent_claim from her own account, a trusted owner sends
 * /agent_claims and /agent_approve <id> from his. Measured 2026-09-13 on the
 * Leela Railway service: no owner was configured (neither LEELA_AGENT_OWNERS
 * nor LEELA_STARS_OPERATORS), so no claim could ever be approved and the
 * agent answered nobody. The variable was set the same day; this tool is the
 * hand that performs the handshake through the two sessions the CRM already
 * holds in tg_sessions (spec: t27 specs/automation/leela-agent-link.t27).
 *
 * WHY OWNER-ONLY AND WHY BOTH MUST BE SELLERS. The tool sends from a SECOND
 * person's session. That is only legitimate because she connected her account
 * in the app herself (the row in tg_sessions is the consent), and because the
 * platform owner -- the same person who approves the claim -- is the one who
 * runs it. A seller cannot run it for another seller.
 *
 * WHAT IS RETURNED: the transcript -- each command, from whom, and the bot's
 * reply -- and whether the final /agent status says the role is active. Never
 * a session string, never a prefix of one.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireOwner, isSeller, withClient } from './telegram-tools'

export const LEELA_BOT = 'leela_chakra_ai_bot'
export const DEFAULT_CLAIMANT = '435572800'
/** Leela: `Заявка <32 hex>` on the first line of the /agent_claim reply. */
const CLAIM_ID = /\b([0-9a-f]{32})\b/

/** The slice of GramJS this tool uses; a fake in tests needs only this. */
export interface HandshakeClient {
  sendMessage: (
    target: string,
    o: { message: string; parseMode?: false }
  ) => Promise<{ id?: number } | unknown>
  getMessages: (chat: string, o: Record<string, unknown>) => Promise<unknown[]>
}

export interface Step {
  from: string
  sent: string
  reply: string
}

interface RawMessage {
  id?: number
  message?: string
  out?: boolean
}

/**
 * Send one command and wait for the bot's reply to IT: an incoming message
 * whose id is greater than the one we just sent. Reading "the last incoming
 * message" would return yesterday's answer when the bot is slow or down.
 */
export async function ask(
  c: HandshakeClient,
  bot: string,
  text: string,
  waitMs: number,
  sleep: (ms: number) => Promise<void> = ms =>
    new Promise(r => setTimeout(r, ms))
): Promise<string> {
  const sent = (await c.sendMessage(bot, {
    message: text,
    parseMode: false,
  })) as RawMessage
  const sentId = Number(sent?.id ?? 0)
  const deadline = Date.now() + waitMs
  let last = ''
  for (;;) {
    await sleep(Math.min(1000, waitMs))
    const msgs = (await c.getMessages(bot, { limit: 3 })) as RawMessage[]
    const reply = msgs.find(
      m => m && !m.out && Number(m.id ?? 0) > sentId && (m.message ?? '').trim()
    )
    if (reply) {
      last = String(reply.message).trim()
      break
    }
    if (Date.now() >= deadline) break
  }
  return last || '(no reply within the wait)'
}

export function claimIdOf(reply: string): string | null {
  const m = CLAIM_ID.exec(reply)
  return m ? m[1] : null
}

/** Leela's /agent status line names the role; "администратор контента" is the linked state. */
export function linkedFromStatus(status: string): boolean {
  return /администратор контента/i.test(status) // cyrillic-ok
}

export const CRM_AGENT_LINK_TOOLS: AgentTool[] = [
  {
    name: 'crm_agent_link',
    description:
      'Связать подключённого продавца с её редакционным агентом в боте Лилы: ' +
      'от её сессии отправить /agent_claim, от сессии владельца — /agent_claims и ' +
      '/agent_approve <id>, затем от её сессии /agent и вернуть статус. ' +
      'Только для владельца платформы; обе учётки должны быть подключены в приложении. ' +
      'Возвращает транскрипт (команда → ответ бота), без секретов.',
    parameters: {
      type: 'object',
      properties: {
        claimant: {
          type: 'string',
          description:
            'Telegram ID продавца, которого связываем (по умолчанию 435572800, @playom)',
        },
        bot: {
          type: 'string',
          description: 'Username бота без @ (по умолчанию leela_chakra_ai_bot)',
        },
        wait_ms: {
          type: 'number',
          description:
            'Сколько ждать ответ бота на каждую команду, мс (по умолчанию 4000)',
        },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      const claimant = String(args.claimant ?? DEFAULT_CLAIMANT).trim()
      const bot = String(args.bot ?? LEELA_BOT)
        .replace(/^@/, '')
        .trim()
      const waitMs = Math.min(
        15000,
        Math.max(1000, Number(args.wait_ms) || 4000)
      )
      if (!/^\d{5,15}$/.test(claimant)) {
        throw new Error('claimant должен быть числовым Telegram ID')
      }
      if (!/^[a-z][a-z0-9_]{3,31}$/i.test(bot)) {
        throw new Error('bot должен быть username без @')
      }
      const owner = String(ctx!.telegramId)
      if (claimant === owner) {
        throw new Error(
          'владелец не может быть заявителем: бот Лилы отказывает в самоодобрении'
        )
      }
      const asClaimant = { ...(ctx ?? {}), telegramId: claimant } as ToolContext
      if (!(await isSeller(asClaimant))) {
        throw new Error(
          `аккаунт ${claimant} не подключён в приложении — связать можно только ` +
            'того, кто сам вошёл в свой Telegram в мини-аппе'
        )
      }

      const steps: Step[] = []
      // 1. The claimant asks.
      const claimReply = await withClient(asClaimant, c =>
        ask(c as unknown as HandshakeClient, bot, '/agent_claim', waitMs)
      )
      steps.push({ from: claimant, sent: '/agent_claim', reply: claimReply })
      const claimId = claimIdOf(claimReply)
      if (!claimId) {
        return {
          linked: false,
          claim_id: null,
          steps,
          hint:
            'бот не вернул номер заявки: проверьте, что LEELA_AGENT_USERNAME совпадает с ' +
            'username заявителя и что бот отвечает в личке',
        }
      }
      // 2-3. The owner lists and approves.
      const ownerSteps = await withClient(ctx, async c => {
        const hc = c as unknown as HandshakeClient
        const list = await ask(hc, bot, '/agent_claims', waitMs)
        const approve = await ask(hc, bot, `/agent_approve ${claimId}`, waitMs)
        return [
          { from: owner, sent: '/agent_claims', reply: list },
          { from: owner, sent: `/agent_approve ${claimId}`, reply: approve },
        ]
      })
      steps.push(...ownerSteps)
      // 4. The claimant checks her status.
      const status = await withClient(asClaimant, c =>
        ask(c as unknown as HandshakeClient, bot, '/agent', waitMs)
      )
      steps.push({ from: claimant, sent: '/agent', reply: status })
      return {
        linked: linkedFromStatus(status),
        claim_id: claimId,
        approved: /одобрен/i.test(ownerSteps[1].reply), // cyrillic-ok
        steps,
      }
    },
  },
]
