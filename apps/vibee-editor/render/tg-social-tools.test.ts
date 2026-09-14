import { describe, it, expect } from 'vitest'
import { TG_SOCIAL_TOOLS, IRREVERSIBLE } from './src/agent/tg-social-tools'
import { TELEGRAM_TOOLS } from './src/agent/telegram-tools'
import {
  forgetProposals,
  pendingFor,
  pendingCount,
} from './src/agent/tg-proposals'

/**
 * The social layer: twenty acts, every one a proposal.
 *
 * None of these handlers opens a client: contacts, pins, reactions, polls,
 * archive, membership and profile all go through the same gate as a send --
 * the executor table in tg-proposals.ts is the only door to the account.
 * What these tests hold:
 *
 *   - the spread into TELEGRAM_TOOLS actually happened: a file the kit does
 *     not import is a file the model cannot call;
 *   - each tool queues the draft of the action it NAMES, with the args the
 *     executor will read -- a draft with the wrong action executes the
 *     wrong act the moment the button is pressed;
 *   - the irreversible six are exactly the destructive set, and each says
 *     so in the `why`, because the `why` is what the model relays to the
 *     person who asked;
 *   - without identity nothing is queued (the same rule as tg_send).
 */

const OWNER = '144022504'
const pool = { query: async () => ({ rows: [] }) }
const OWNER_CTX = { telegramId: OWNER, pool, surface: 'bot' } as never
// Quoted fragment, not a regex: the no-cyrillic gate strips string literals
// but not regex literals.
const NO_IDENTITY = 'кто спрашивает'

/** The action each tool must propose -- declared, so a mismatch is loud. */
const TOOL_ACTION: Record<string, string> = {
  tg_contact_add: 'contact_add',
  tg_contact_delete: 'contact_delete',
  tg_block: 'block',
  tg_unblock: 'unblock',
  tg_profile_update: 'profile_update',
  tg_profile_photo: 'profile_photo',
  tg_profile_photo_delete: 'profile_photo_delete',
  tg_online: 'online',
  tg_pin: 'pin',
  tg_unpin: 'unpin',
  tg_react: 'react',
  tg_vote: 'vote',
  tg_archive: 'archive',
  tg_unarchive: 'unarchive',
  tg_mark_unread: 'mark_unread',
  tg_join: 'join',
  tg_leave: 'leave',
  tg_kick: 'kick',
  tg_delete_messages: 'delete',
  tg_delete_chat: 'delete_chat',
}

/** A call each tool ACCEPTS, mirroring the boundary suite's VALID_ARGS. */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  tg_contact_add: {
    phone: '+79001234567',
    firstName: 'Анна',
    lastName: 'Иванова',
  },
  tg_contact_delete: { user: '987654321' },
  tg_block: { user: '987654321' },
  tg_unblock: { user: '987654321' },
  tg_profile_update: { firstName: 'Иван', bio: 'мастер' },
  tg_profile_photo: { url: 'https://x/p.jpg' },
  tg_profile_photo_delete: {},
  tg_online: {},
  tg_pin: { chat: '123', messageId: 5 },
  tg_unpin: { chat: '123', messageId: 5 },
  tg_react: { chat: '123', messageId: 5, emoticon: '👍' },
  tg_vote: { chat: '123', messageId: 9, options: [0, 2] },
  tg_archive: { chat: '123' },
  tg_unarchive: { chat: '123' },
  tg_mark_unread: { chat: '123' },
  tg_join: { channel: '@news' },
  tg_leave: { chat: '-1001234567890' },
  tg_kick: { chat: '-1001234567890', user: '987654321' },
  tg_delete_messages: { chat: '123', messageIds: [4, 5] },
  tg_delete_chat: { chat: '123', mode: 'clear' },
}

const SOCIAL_NAMES = Object.keys(TOOL_ACTION)

describe('соц-слой разложен в общий набор', () => {
  it('ровно двадцать инструментов, имена уникальны', () => {
    expect(TG_SOCIAL_TOOLS).toHaveLength(20)
    expect(new Set(TG_SOCIAL_TOOLS.map(t => t.name)).size).toBe(20)
    expect([...SOCIAL_NAMES].sort()).toEqual(
      TG_SOCIAL_TOOLS.map(t => t.name).sort()
    )
  })

  it('каждое имя доезжает до TELEGRAM_TOOLS', () => {
    // The kit registers TELEGRAM_TOOLS, not this file. A tool forgotten in
    // the spread passes every per-tool test below and still does not exist.
    const names = new Set(TELEGRAM_TOOLS.map(t => t.name))
    for (const n of SOCIAL_NAMES) {
      expect(names.has(n), `${n} нет в TELEGRAM_TOOLS`).toBe(true)
    }
  })
})

describe('каждый соц-инструмент кладёт черновик своего action', () => {
  for (const name of SOCIAL_NAMES) {
    it(`${name} → ${TOOL_ACTION[name]}`, async () => {
      forgetProposals()
      const t = TG_SOCIAL_TOOLS.find(x => x.name === name)!
      const answer = (await t.handler(VALID_ARGS[name], OWNER_CTX)) as {
        proposal?: boolean
        why?: string
        id?: string
      }
      expect(answer.proposal).toBe(true)
      expect(answer.why).toBeTruthy()
      const waiting = pendingFor(OWNER)
      expect(waiting, 'черновик не встал в очередь').toBeTruthy()
      expect(waiting!.id).toBe(answer.id)
      expect(waiting!.action).toBe(TOOL_ACTION[name])
    })
  }
})

describe('необратимое названо необратимым', () => {
  it('набор ровно из шести деструктивных действий', () => {
    expect([...IRREVERSIBLE].sort()).toEqual(
      [
        'block',
        'delete',
        'delete_chat',
        'kick',
        'leave',
        'profile_photo_delete',
      ].sort()
    )
  })

  it('why каждого необратимого предупреждает человека', async () => {
    for (const name of SOCIAL_NAMES) {
      if (!IRREVERSIBLE.has(TOOL_ACTION[name] as never)) continue
      const t = TG_SOCIAL_TOOLS.find(x => x.name === name)!
      const answer = (await t.handler(VALID_ARGS[name], OWNER_CTX)) as {
        why?: string
      }
      expect(
        answer.why!.toLowerCase(),
        `${name} не предупреждает о необратимости`
      ).toContain('необратим')
    }
  })
})

describe('без личности соц-слой не действует', () => {
  for (const name of SOCIAL_NAMES) {
    it(`${name} отказывает вызову без подтверждённой личности`, async () => {
      forgetProposals()
      const t = TG_SOCIAL_TOOLS.find(x => x.name === name)!
      await expect(
        t.handler(VALID_ARGS[name], undefined as never)
      ).rejects.toThrow(NO_IDENTITY)
      expect(pendingCount()).toBe(0)
    })
  }
})

describe('черновик несёт аргументы исполнителя', () => {
  it('голосование: индексы вариантов вместе с опросом', async () => {
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_vote')!
    await t.handler({ chat: '123', messageId: 9, options: [0, 2] }, OWNER_CTX)
    const d = pendingFor(OWNER)!
    expect(d.action).toBe('vote')
    expect(d.args).toEqual({ chat: '123', messageId: 9, options: [0, 2] })
  })

  it('контакт: телефон и имя доезжают целиком', async () => {
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_contact_add')!
    await t.handler(VALID_ARGS.tg_contact_add, OWNER_CTX)
    const d = pendingFor(OWNER)!
    expect(d.action).toBe('contact_add')
    expect(d.args).toEqual({
      phone: '+79001234567',
      firstName: 'Анна',
      lastName: 'Иванова',
    })
  })

  it('профиль: в args только названные поля', async () => {
    // The executor maps exactly the keys it finds; a `lastName: undefined`
    // stamped into the bag would read as an intent to blank the surname.
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_profile_update')!
    await t.handler({ firstName: 'Иван' }, OWNER_CTX)
    const d = pendingFor(OWNER)!
    expect(d.args).toEqual({ firstName: 'Иван' })
  })

  it('профиль без единого поля — ошибка инструмента', async () => {
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_profile_update')!
    await expect(t.handler({}, OWNER_CTX)).rejects.toThrow('нечего менять')
    expect(pendingCount()).toBe(0)
  })

  it('закрепление без messageId отказывает до карточки', async () => {
    // The wrapper without an id unpins EVERYTHING -- the executor's check
    // stands on this, and the tool must not let a draft reach it.
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_pin')!
    await expect(t.handler({ chat: '123' }, OWNER_CTX)).rejects.toThrow(
      'messageId'
    )
    expect(pendingCount()).toBe(0)
  })

  it('удаление чата: mode доезжает до исполнителя', async () => {
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_delete_chat')!
    await t.handler({ chat: '123', mode: 'clear' }, OWNER_CTX)
    const d = pendingFor(OWNER)!
    expect(d.action).toBe('delete_chat')
    expect(d.args).toEqual({ mode: 'clear' })
  })

  it('удаление сообщений: список обрезается до 100', async () => {
    // The same ceiling the executor's check enforces: the model learns the
    // limit from the tool answer, not from a refused press.
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_delete_messages')!
    const ids = Array.from({ length: 105 }, (_, i) => i + 1)
    await t.handler({ chat: '123', messageIds: ids }, OWNER_CTX)
    const d = pendingFor(OWNER)!
    expect((d.args as { messageIds: number[] }).messageIds).toHaveLength(100)
  })

  it('вступление принимает @username и ссылку-приглашение, мусор — нет', async () => {
    forgetProposals()
    const t = TG_SOCIAL_TOOLS.find(x => x.name === 'tg_join')!
    await t.handler({ channel: '@news' }, OWNER_CTX)
    expect(pendingFor(OWNER)!.action).toBe('join')
    forgetProposals()
    await t.handler({ channel: 'https://t.me/+AbCdEfGh1234' }, OWNER_CTX)
    expect(pendingFor(OWNER)!.action).toBe('join')
    await expect(
      t.handler({ channel: 'просто название' }, OWNER_CTX)
    ).rejects.toThrow('t.me')
    expect(pendingCount()).toBe(1)
  })
})
