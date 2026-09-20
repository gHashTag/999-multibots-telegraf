import { describe, it, expect } from 'vitest'

/**
 * THE SOCIAL CARDS: twenty new acts reached the queue, and the card is the
 * only place a person meets them.
 *
 * Until 2026-09-14 the ask knew three verbs -- send, forward, read -- and
 * everything else fell back to quoting the act's identifier, a string a
 * person cannot read. A card that asks in identifiers asks nobody anything:
 * the press stops being a decision and becomes a reflex.
 *
 * What these tests hold, per act and in both languages:
 *
 *   - the ask names the act in words, not in the action's identifier;
 *   - the row label asks the right question (a pin is about a CHAT, a
 *     block is about a USER, a profile act is about the ACCOUNT -- and no
 *     act aimed at "me" prints a "to whom" row);
 *   - the green button carries the act's own verb, so the muscle memory
 *     built on the send verb does not execute a deletion;
 *   - the six irreversible acts say so ON the card, before the press;
 *   - the wire stays the wire: two buttons, 64 bytes, the same
 *     id-and-secret callback whatever the prose says.
 */

const load = () => import('@/services/telegramProposals')

const ID = '3f2504e04f89' // the real generated shape: 12 hex
const SECRET = 'a'.repeat(32) // ...and a 32-hex one-time secret

const draft = (over: Record<string, unknown> = {}) =>
  ({
    id: ID,
    action: 'send',
    target: '@ivan',
    secret: SECRET,
    ...over,
  }) as never

/** Every social act the card must be able to draw, with its expectations. */
const CASES = [
  {
    action: 'contact_add',
    target: '+79001234567',
    what: 'контакт: Анна Иванова (+79001234567)',
    askRu: 'Добавить контакт',
    askEn: 'Add this contact',
    labelRu: 'Контакт:',
    buttonRu: '✅ Добавить',
  },
  {
    action: 'contact_delete',
    target: '987654321',
    what: 'контакт 987654321',
    askRu: 'Удалить контакт',
    askEn: 'Delete this contact',
    labelRu: 'Контакт:',
    buttonRu: '✅ Удалить',
  },
  {
    action: 'block',
    target: '987654321',
    what: 'пользователь 987654321',
    askRu: 'Заблокировать пользователя',
    askEn: 'Block this user',
    labelRu: 'Пользователь:',
    buttonRu: '✅ Заблокировать',
    irreversible: true,
  },
  {
    action: 'unblock',
    target: '987654321',
    what: 'пользователь 987654321',
    askRu: 'Разблокировать пользователя',
    askEn: 'Unblock this user',
    labelRu: 'Пользователь:',
    buttonRu: '✅ Разблокировать',
  },
  {
    action: 'profile_update',
    target: 'me',
    what: 'профиль: имя, био',
    askRu: 'Изменить профиль аккаунта',
    askEn: 'Update the account profile',
    labelRu: null, // an act on "me" prints no "to whom" row at all
    buttonRu: '✅ Изменить',
  },
  {
    action: 'profile_photo',
    target: 'me',
    what: 'новое фото профиля',
    askRu: 'Поставить новое фото профиля',
    askEn: 'Set a new profile photo',
    labelRu: null,
    buttonRu: '✅ Поставить фото',
  },
  {
    action: 'profile_photo_delete',
    target: 'me',
    what: 'фото профиля',
    askRu: 'Удалить фото профиля',
    askEn: 'Delete the profile photo',
    labelRu: null,
    buttonRu: '✅ Удалить',
    irreversible: true,
  },
  {
    action: 'online',
    target: 'me',
    what: 'статус «в сети»',
    askRu: 'Показать статус',
    askEn: 'Show the online status',
    labelRu: null,
    buttonRu: '✅ В сеть',
  },
  {
    action: 'pin',
    target: '123',
    what: 'сообщение 5 в 123',
    args: { messageId: 5 },
    askRu: 'Закрепить сообщение',
    askEn: 'Pin this message',
    labelRu: 'Чат:',
    buttonRu: '✅ Закрепить',
  },
  {
    action: 'unpin',
    target: '123',
    what: 'сообщение 5 в 123',
    args: { messageId: 5 },
    askRu: 'Открепить сообщение',
    askEn: 'Unpin this message',
    labelRu: 'Чат:',
    buttonRu: '✅ Открепить',
  },
  {
    action: 'react',
    target: '123',
    what: '👍 на сообщение 5 в 123',
    args: { messageId: 5, emoticon: '👍' },
    askRu: 'Поставить реакцию',
    askEn: 'Add this reaction',
    labelRu: 'Чат:',
    buttonRu: '✅ Реакция',
  },
  {
    action: 'vote',
    target: '123',
    what: 'варианты 0, 2 в опросе 9 (123)',
    args: { messageId: 9, options: [0, 2] },
    askRu: 'Проголосовать в опросе',
    askEn: 'Vote in this poll',
    labelRu: 'Чат:',
    buttonRu: '✅ Проголосовать',
  },
  {
    action: 'archive',
    target: '123',
    what: 'диалог 123',
    askRu: 'Убрать диалог в архив',
    askEn: 'Archive this chat',
    labelRu: 'Чат:',
    buttonRu: '✅ В архив',
  },
  {
    action: 'unarchive',
    target: '123',
    what: 'диалог 123',
    askRu: 'Вернуть диалог из архива',
    askEn: 'Unarchive this chat',
    labelRu: 'Чат:',
    buttonRu: '✅ Из архива',
  },
  {
    action: 'mark_unread',
    target: '123',
    what: 'диалог 123',
    askRu: 'Пометить диалог непрочитанным',
    askEn: 'Mark this chat unread',
    labelRu: 'Чат:',
    buttonRu: '✅ Непрочитанным',
  },
  {
    action: 'join',
    target: '@news',
    what: '@news',
    askRu: 'Вступить в канал',
    askEn: 'Join this channel',
    labelRu: 'Канал:',
    buttonRu: '✅ Вступить',
  },
  {
    action: 'leave',
    target: '-1001234567890',
    what: '-1001234567890',
    askRu: 'Покинуть чат',
    askEn: 'Leave this chat',
    labelRu: 'Чат:',
    buttonRu: '✅ Покинуть',
    irreversible: true,
  },
  {
    action: 'kick',
    target: '-1001234567890',
    what: 'участник 987654321 из -1001234567890',
    args: { user: '987654321' },
    askRu: 'Исключить участника',
    askEn: 'Remove this member',
    labelRu: 'Чат:',
    buttonRu: '✅ Исключить',
    irreversible: true,
  },
  {
    action: 'delete',
    target: '123',
    what: 'сообщения 4, 5 из 123',
    args: { messageIds: [4, 5] },
    askRu: 'Удалить сообщения',
    askEn: 'Delete these messages',
    labelRu: 'Чат:',
    buttonRu: '✅ Удалить',
    irreversible: true,
  },
  {
    action: 'delete_chat',
    target: '123',
    what: 'удалить чат 123',
    askRu: 'Удалить чат',
    askEn: 'Delete this chat',
    labelRu: 'Чат:',
    buttonRu: '✅ Удалить',
    irreversible: true,
  },
]

describe('each social act asks its own question', () => {
  for (const c of CASES) {
    it(`${c.action}: asks in words, labels the right thing, buttons its own verb`, async () => {
      const { proposalCard } = await load()
      const ru = proposalCard(
        draft({
          action: c.action,
          target: c.target,
          what: c.what,
          args: c.args,
        }),
        true
      )
      expect(ru.text).toContain(c.askRu)
      // The identifier itself is not a question a person can read.
      expect(ru.text).not.toContain(`«${c.action}»`)
      if (c.labelRu) expect(ru.text).toContain(c.labelRu)
      else expect(ru.text).not.toContain('Кому:')
      const en = proposalCard(
        draft({
          action: c.action,
          target: c.target,
          what: c.what,
          args: c.args,
        }),
        false
      )
      expect(en.text).toContain(c.askEn)

      const buttons = ru.markup.reply_markup.inline_keyboard.flat() as Array<{
        text: string
      }>
      expect(buttons[0].text).toBe(c.buttonRu)
      expect(buttons[1].text).toBe('✖️ Отмена')
    })
  }

  it('a react with no emoticon is asked as a removal, not an add', async () => {
    const { proposalCard } = await load()
    const ru = proposalCard(
      draft({
        action: 'react',
        target: '123',
        args: { messageId: 5, emoticon: '' },
      }),
      true
    )
    expect(ru.text).toContain('Снять реакцию')
    const en = proposalCard(
      draft({
        action: 'react',
        target: '123',
        args: { messageId: 5, emoticon: '' },
      }),
      false
    )
    expect(en.text).toContain('Remove the reaction')
  })

  it('delete_chat clear asks about the history, not about leaving', async () => {
    const { proposalCard } = await load()
    const ru = proposalCard(
      draft({ action: 'delete_chat', target: '123', args: { mode: 'clear' } }),
      true
    )
    expect(ru.text).toContain('Очистить историю')
    expect(ru.text).not.toContain('Удалить чат')
    const button = (
      ru.markup.reply_markup.inline_keyboard.flat() as Array<{
        text: string
      }>
    )[0].text
    expect(button).toBe('✅ Очистить')
  })

  it('an unknown action still names itself rather than posing as a message', async () => {
    // The honest fallback from before the table: a poisoned or future
    // action must not inherit a friendly verb it did not earn.
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({ action: 'stonks', target: '@x', what: 'x' }),
      true
    )
    expect(card.text).toContain('«stonks»')
  })
})

describe('the irreversible six shout before the press', () => {
  it('the set is exactly the destructive six, spelled once', async () => {
    const { IRREVERSIBLE_SOCIAL } = await load()
    expect([...IRREVERSIBLE_SOCIAL].sort()).toEqual(
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

  it('every irreversible act carries the warning, in both languages', async () => {
    const { proposalCard } = await load()
    for (const c of CASES) {
      if (!c.irreversible) continue
      const ru = proposalCard(
        draft({
          action: c.action,
          target: c.target,
          what: c.what,
          args: c.args,
        }),
        true
      )
      expect(ru.text, `${c.action} без предупреждения`).toContain('НЕОБРАТИМО')
      const en = proposalCard(
        draft({
          action: c.action,
          target: c.target,
          what: c.what,
          args: c.args,
        }),
        false
      )
      expect(en.text, `${c.action} without the English warning`).toContain(
        'IRREVERSIBLE'
      )
    }
  })

  it('a reversible act does not cry wolf', async () => {
    // The warning is load-bearing only while it is rare. Pin on archive:
    // if everything becomes "irreversible", nothing is.
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({ action: 'archive', target: '123', what: 'диалог 123' }),
      true
    )
    expect(card.text).not.toContain('НЕОБРАТИМО')
  })
})

describe('the wire stays the wire for all twenty acts', () => {
  for (const c of CASES) {
    it(`${c.action}: two buttons, 64 bytes, secret inside the callback only`, async () => {
      const { proposalCard, PROPOSAL_OK, PROPOSAL_NO } = await load()
      const card = proposalCard(
        draft({
          action: c.action,
          target: c.target,
          what: c.what,
          args: c.args,
        }),
        true
      )
      const buttons = card.markup.reply_markup.inline_keyboard.flat() as Array<{
        callback_data: string
      }>
      expect(buttons.length).toBe(2)
      for (const b of buttons) {
        expect(Buffer.byteLength(b.callback_data, 'utf8')).toBeLessThanOrEqual(
          64
        )
      }
      expect(buttons[0].callback_data).toBe(`${PROPOSAL_OK}${ID}:${SECRET}`)
      expect(buttons[1].callback_data).toBe(`${PROPOSAL_NO}${ID}:${SECRET}`)
      expect(card.text).not.toContain(SECRET)
    })
  }
})
