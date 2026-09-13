/**
 * THE HANDSHAKE THAT LINKS A SELLER TO HER LEELA EDITORIAL AGENT.
 *
 * Leela grants its content-administrator role only when the claimant asks
 * from her own account and a separate trusted owner approves from his.
 * Measured 2026-09-13: the Leela service had no trusted owner configured, so
 * nothing was ever approved. This file pins the tool that performs the
 * handshake through the two connected sessions: owner-only, claimant must be
 * a connected seller, the reply read is the one AFTER the sent command, the
 * claim id is parsed from Leela's actual reply shape, and no session string
 * leaves. Spec: t27 specs/automation/leela-agent-link.t27.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '144022504'
const PLAYOM = '435572800'
const STRANGER = '900000042'
process.env.OWNER_TELEGRAM_ID = OWNER
process.env.TELEGRAM_API_ID = '1'
process.env.TELEGRAM_API_HASH = 'h'
delete process.env.TELEGRAM_SESSION_STRING

const SESSION = 's'.repeat(369)
const CLAIM = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

function sessionsPool(ids: string[]) {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      if (/CREATE TABLE/i.test(sql)) return { rows: [] }
      if (/SELECT session FROM tg_sessions/.test(sql)) {
        return {
          rows: ids.includes(String(params[0])) ? [{ session: SESSION }] : [],
        }
      }
      return { rows: [] }
    },
  }
}

/**
 * A bot that answers like Leela does. Each client is built per session string
 * by the mocked `telegram` module; the fake keeps one shared chat log so the
 * owner's /agent_claims sees the claimant's claim.
 */
function leelaBot() {
  const log: Array<{ id: number; message: string; out: boolean; by: string }> =
    []
  let nextId = 100
  let approved = false
  const sent: Array<{ by: string; text: string }> = []
  const answer = (by: string, text: string): string => {
    if (text === '/agent_claim') {
      return `Заявка ${CLAIM}\nTelegram ID: ${by}\nИстекает 2026-09-14T00:00:00.000Z.\nДоступ не выдан.`
    }
    if (text === '/agent_claims') {
      return `Ожидают отдельного одобрения (не более 20):\n${CLAIM} · @playom · Telegram ID ${PLAYOM} · до 2026-09-14T00:00:00.000Z`
    }
    if (text.startsWith('/agent_approve ')) {
      approved = text.endsWith(CLAIM) && by === OWNER
      return approved
        ? 'Доступ администратора контента одобрен на 30 дней.'
        : 'Заявка не найдена, истекла, отозвана или не допускает выдачу роли.'
    }
    if (text === '/agent') {
      return `Leela • редакционный агент. Роль: ${approved && by === PLAYOM ? 'администратор контента' : by === OWNER ? 'доверенный владелец' : 'не одобрена'}.`
    }
    return 'Используйте /agent help.'
  }
  const clientFor = (by: string) => ({
    connect: async () => {},
    checkAuthorization: async () => true,
    disconnect: async () => {},
    destroy: async () => {},
    sendMessage: async (_t: string, o: { message: string }) => {
      sent.push({ by, text: o.message })
      const id = nextId++
      log.push({ id, message: o.message, out: true, by })
      log.push({ id: nextId++, message: answer(by, o.message), out: false, by })
      return { id }
    },
    getMessages: async (_c: string, o: { limit: number }) =>
      log
        .filter(m => m.by === by)
        .slice(-o.limit)
        .reverse(),
  })
  return { clientFor, sent, isApproved: () => approved }
}

beforeEach(() => {
  vi.resetModules()
})

/** Route the mocked TelegramClient to the right fake by the caller's id. */
async function mockTelegram(bot: ReturnType<typeof leelaBot>, order: string[]) {
  let n = 0
  vi.doMock('telegram', () => ({
    TelegramClient: class {
      private who = order[n++] ?? OWNER
      connect = async () => {}
      checkAuthorization = async () => true
      disconnect = async () => {}
      destroy = async () => {}
      sendMessage = (t: string, o: { message: string }) =>
        bot.clientFor(this.who).sendMessage(t, o)
      getMessages = (c: string, o: { limit: number }) =>
        bot.clientFor(this.who).getMessages(c, o)
    },
  }))
  vi.doMock('telegram/sessions', () => ({
    StringSession: class {
      constructor(public s: string) {}
    },
  }))
}

describe('ask', () => {
  it("reads the reply that came AFTER the sent command, not yesterday's", async () => {
    const { ask } = await import('./src/agent/crm-agent-link-tool')
    let polls = 0
    const c = {
      sendMessage: async () => ({ id: 50 }),
      getMessages: async () => {
        polls++
        return polls < 2
          ? [{ id: 49, message: 'old answer', out: false }]
          : [
              { id: 51, message: 'fresh answer', out: false },
              { id: 50, message: '/agent', out: true },
              { id: 49, message: 'old answer', out: false },
            ]
      },
    }
    const reply = await ask(
      c,
      'leela_chakra_ai_bot',
      '/agent',
      3000,
      async () => {}
    )
    expect(reply).toBe('fresh answer')
    expect(polls).toBe(2)
  })

  it('says so when the bot is silent', async () => {
    const { ask } = await import('./src/agent/crm-agent-link-tool')
    const c = {
      sendMessage: async () => ({ id: 50 }),
      getMessages: async () => [{ id: 50, message: '/agent', out: true }],
    }
    const reply = await ask(
      c,
      'leela_chakra_ai_bot',
      '/agent',
      1,
      async () => {}
    )
    expect(reply).toMatch(/no reply/)
  })
})

describe('claimIdOf / linkedFromStatus', () => {
  it("parses Leela's claim reply and status line", async () => {
    const { claimIdOf, linkedFromStatus } = await import(
      './src/agent/crm-agent-link-tool'
    )
    expect(claimIdOf(`Заявка ${CLAIM}\nTelegram ID: ${PLAYOM}`)).toBe(CLAIM)
    expect(claimIdOf('Ожидающих заявок нет.')).toBeNull()
    expect(
      linkedFromStatus(
        'Leela • редакционный агент. Роль: администратор контента.'
      )
    ).toBe(true)
    expect(
      linkedFromStatus('Leela • редакционный агент. Роль: не одобрена.')
    ).toBe(false)
  })
})

describe('crm_agent_link', () => {
  it('runs the four steps through the two sessions and reports linked', async () => {
    const bot = leelaBot()
    await mockTelegram(bot, [PLAYOM, OWNER, PLAYOM])
    const { CRM_AGENT_LINK_TOOLS } = await import(
      './src/agent/crm-agent-link-tool'
    )
    const tool = CRM_AGENT_LINK_TOOLS[0]
    expect(tool.name).toBe('crm_agent_link')
    const out: any = await tool.handler({ wait_ms: 1000 }, {
      telegramId: OWNER,
      pool: sessionsPool([OWNER, PLAYOM]),
    } as never)
    expect(out.linked).toBe(true)
    expect(out.approved).toBe(true)
    expect(out.claim_id).toBe(CLAIM)
    expect(out.steps.map((s: any) => [s.from, s.sent])).toEqual([
      [PLAYOM, '/agent_claim'],
      [OWNER, '/agent_claims'],
      [OWNER, `/agent_approve ${CLAIM}`],
      [PLAYOM, '/agent'],
    ])
    expect(bot.sent.map(s => s.by)).toEqual([PLAYOM, OWNER, OWNER, PLAYOM])
    expect(JSON.stringify(out)).not.toContain(SESSION.slice(0, 12))
  })

  it("is the owner's tool: a seller cannot link another seller", async () => {
    const { CRM_AGENT_LINK_TOOLS } = await import(
      './src/agent/crm-agent-link-tool'
    )
    await expect(
      CRM_AGENT_LINK_TOOLS[0].handler({ claimant: OWNER }, {
        telegramId: PLAYOM,
        pool: sessionsPool([OWNER, PLAYOM]),
      } as never)
    ).rejects.toThrow('владельцу')
  })

  it('refuses a claimant who never connected her account, before touching Telegram', async () => {
    const bot = leelaBot()
    await mockTelegram(bot, [])
    const { CRM_AGENT_LINK_TOOLS } = await import(
      './src/agent/crm-agent-link-tool'
    )
    await expect(
      CRM_AGENT_LINK_TOOLS[0].handler({ claimant: STRANGER }, {
        telegramId: OWNER,
        pool: sessionsPool([OWNER]),
      } as never)
    ).rejects.toThrow('не подключён')
    expect(bot.sent).toHaveLength(0)
  })

  it('refuses the owner as his own claimant', async () => {
    const { CRM_AGENT_LINK_TOOLS } = await import(
      './src/agent/crm-agent-link-tool'
    )
    await expect(
      CRM_AGENT_LINK_TOOLS[0].handler({ claimant: OWNER }, {
        telegramId: OWNER,
        pool: sessionsPool([OWNER]),
      } as never)
    ).rejects.toThrow('самоодобрении')
  })

  it('stops after the claim when the bot returns no claim id, and says why', async () => {
    const bot = leelaBot()
    // A bot that answers the claim with the help text instead of a claim id.
    const silent = {
      ...bot,
      clientFor: (by: string) => {
        const c = bot.clientFor(by)
        return {
          ...c,
          sendMessage: async (t: string, o: { message: string }) => {
            bot.sent.push({ by, text: o.message })
            return c.sendMessage(t, { message: 'noop' })
          },
        }
      },
    }
    await mockTelegram(silent as never, [PLAYOM])
    const { CRM_AGENT_LINK_TOOLS } = await import(
      './src/agent/crm-agent-link-tool'
    )
    const out: any = await CRM_AGENT_LINK_TOOLS[0].handler({ wait_ms: 1000 }, {
      telegramId: OWNER,
      pool: sessionsPool([OWNER, PLAYOM]),
    } as never)
    expect(out.linked).toBe(false)
    expect(out.claim_id).toBeNull()
    expect(out.steps).toHaveLength(1)
    expect(out.hint).toMatch(/LEELA_AGENT_USERNAME/)
    expect(bot.sent.filter(s => s.by === OWNER)).toHaveLength(0)
  })
})
