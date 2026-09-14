import type { AgentTool, ToolContext } from './tools'
import type { ProposalAction } from './tg-proposals'
/*
 * The gate, from its own shelf: importing `propose` from telegram-tools
 * would close a cycle (it spreads this file), and a cycle whose entry point
 * is THIS file leaves that spread reading an uninitialized binding. The
 * gate moved out to tg-propose.ts precisely so this import is a leaf.
 */
import { propose } from './tg-propose'

/**
 * THE SOCIAL LAYER: contacts, profile, pins, reactions, polls, dialog order,
 * membership. Twenty acts, and not one of them happens here.
 *
 * Every handler is a `propose()` and nothing else: no `withClient`, no
 * session, no socket. The act itself lives in the executor table
 * (tg-proposals.ts) behind the same confirmation gate as a send, so the
 * property this kit was built on holds for its loudest acts too -- nothing
 * reaches another person, or reshapes the account itself, from the model's
 * word alone.
 *
 * IRREVERSIBLE names the six acts a press cannot take back. The bot card
 * reads this set to shout before the button; the `why` of each of those
 * tools says it in words as well, because the `why` is what the model
 * relays to the person who asked.
 */

export const IRREVERSIBLE: ReadonlySet<ProposalAction> = new Set([
  'block',
  'delete',
  'delete_chat',
  'kick',
  'leave',
  'profile_photo_delete',
])

/** A string the act needs, or a thrown tool error the model can fix. */
function needString(
  args: Record<string, any>,
  key: string,
  hint: string
): string {
  const s = String(args[key] ?? '').trim()
  if (!s) throw new Error(hint)
  return s
}

/** A message id the wrapper will accept, or a thrown tool error. */
function needMessageId(args: Record<string, any>): number {
  const n = Number(args.messageId)
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(
      'нужен messageId: id конкретного сообщения из tg_history или tg_search'
    )
  return n
}

export const TG_SOCIAL_TOOLS: AgentTool[] = [
  {
    name: 'tg_contact_add',
    description:
      'Добавить контакт в адресную книгу аккаунта по номеру телефона. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Телефон в международном формате, например +79001234567',
        },
        firstName: { type: 'string', description: 'Имя контакта' },
        lastName: { type: 'string', description: 'Фамилия (необязательно)' },
      },
      required: ['phone', 'firstName'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const phone = needString(
        args,
        'phone',
        'укажите phone в международном формате, например +79001234567'
      )
      const firstName = needString(
        args,
        'firstName',
        'укажите firstName — как назвать контакт'
      )
      const lastName = String(args.lastName ?? '').trim()
      return propose(
        'contact_add',
        phone,
        `контакт: ${firstName}${lastName ? ' ' + lastName : ''} (${phone})`,
        'Контакт попадёт в адресную книгу аккаунта — изменение уходит вместе с синхронизацией Telegram.',
        ctx,
        undefined,
        undefined,
        { args: { phone, firstName, lastName } }
      )
    },
  },

  {
    name: 'tg_contact_delete',
    description:
      'Удалить контакт из адресной книги аккаунта. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'Пользователь: id или @username',
        },
      },
      required: ['user'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const user = needString(
        args,
        'user',
        'укажите user: id пользователя или @username'
      )
      return propose(
        'contact_delete',
        user,
        `контакт ${user}`,
        'Контакт исчезнет из адресной книги аккаунта.',
        ctx,
        undefined,
        undefined,
        { args: { user } }
      )
    },
  },

  {
    name: 'tg_block',
    description:
      'Заблокировать пользователя: он больше не сможет писать аккаунту. ' +
      'НЕОБРАТИМО. НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'Пользователь: id или @username',
        },
      },
      required: ['user'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const user = needString(
        args,
        'user',
        'укажите user: id пользователя или @username'
      )
      return propose(
        'block',
        user,
        `пользователь ${user}`,
        'Блок остановит переписку: сообщения, отправленные человеком за время блока, не доставятся и не вернутся. Эта часть необратима.',
        ctx,
        undefined,
        undefined,
        { args: { user } }
      )
    },
  },

  {
    name: 'tg_unblock',
    description:
      'Снять блокировку с пользователя. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'Пользователь: id или @username',
        },
      },
      required: ['user'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const user = needString(
        args,
        'user',
        'укажите user: id пользователя или @username'
      )
      return propose(
        'unblock',
        user,
        `пользователь ${user}`,
        'Пользователь снова сможет писать аккаунту.',
        ctx,
        undefined,
        undefined,
        { args: { user } }
      )
    },
  },

  {
    name: 'tg_profile_update',
    description:
      'Изменить имя, фамилию или био профиля аккаунта (косметика профиля). ' +
      'Хотя бы одно поле. НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'Новое имя' },
        lastName: { type: 'string', description: 'Новая фамилия' },
        bio: {
          type: 'string',
          description: 'Новое био (about, до 70 символов)',
        },
      },
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const first = String(args.firstName ?? '').trim()
      const last = String(args.lastName ?? '').trim()
      const bio = String(args.bio ?? '').trim()
      if (!first && !last && !bio)
        throw new Error('нечего менять: назовите firstName, lastName или bio')
      /*
       * Only the named fields travel: the executor maps exactly the keys it
       * finds, so an undefined stamped into the bag would read as an intent
       * to blank that field on the profile.
       */
      const fields: Record<string, string> = {}
      if (first) fields.firstName = first
      if (last) fields.lastName = last
      if (bio) fields.bio = bio
      const changed = [first && 'имя', last && 'фамилия', bio && 'био'].filter(
        Boolean
      )
      return propose(
        'profile_update',
        'me',
        `профиль: ${changed.join(', ')}`,
        'Правка профиля видна всем, у кого открыт диалог с аккаунтом.',
        ctx,
        undefined,
        undefined,
        { args: fields }
      )
    },
  },

  {
    name: 'tg_profile_photo',
    description:
      'Поставить новое фото профиля по URL картинки. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL картинки (https)' },
      },
      required: ['url'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const url = needString(args, 'url', 'укажите url картинки (https://…)')
      if (!/^https:\/\//.test(url))
        throw new Error('url фото профиля должен начинаться с https://')
      return propose(
        'profile_photo',
        'me',
        'новое фото профиля',
        'Фото профиля видно всем, кто открывает аккаунт.',
        ctx,
        undefined,
        undefined,
        { args: { url } }
      )
    },
  },

  {
    name: 'tg_profile_photo_delete',
    description:
      'Удалить текущее фото профиля. НЕОБРАТИМО. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: { type: 'object', properties: {} },
    async handler(_args: Record<string, any>, ctx?: ToolContext) {
      return propose(
        'profile_photo_delete',
        'me',
        'фото профиля',
        'Текущее фото профиля будет удалено; прежнее вернуть можно только загрузив файл заново. Действие необратимо.',
        ctx
      )
    },
  },

  {
    name: 'tg_online',
    description:
      'Показать статус «в сети» для собеседников. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: { type: 'object', properties: {} },
    async handler(_args: Record<string, any>, ctx?: ToolContext) {
      return propose(
        'online',
        'me',
        'статус «в сети»',
        'Статус увидят собеседники — аккаунт перестанет выглядеть офлайн.',
        ctx
      )
    },
  },

  {
    name: 'tg_pin',
    description:
      'Закрепить сообщение в чате — messageId из tg_history или tg_search. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        messageId: {
          type: 'number',
          description: 'id сообщения из tg_history/tg_search',
        },
      },
      required: ['chat', 'messageId'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      const messageId = needMessageId(args)
      return propose(
        'pin',
        chat,
        `сообщение ${messageId} в ${chat}`,
        'Закреплённое сообщение останется сверху чата для всех его участников.',
        ctx,
        undefined,
        undefined,
        { args: { chat, messageId } }
      )
    },
  },

  {
    name: 'tg_unpin',
    description:
      'Открепить сообщение в чате — messageId из tg_history или tg_search. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        messageId: {
          type: 'number',
          description: 'id сообщения из tg_history/tg_search',
        },
      },
      required: ['chat', 'messageId'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      const messageId = needMessageId(args)
      return propose(
        'unpin',
        chat,
        `сообщение ${messageId} в ${chat}`,
        'Верх чата освободится для всех его участников.',
        ctx,
        undefined,
        undefined,
        { args: { chat, messageId } }
      )
    },
  },

  {
    name: 'tg_react',
    description:
      'Поставить реакцию-эмодзи на сообщение; пустой emoticon — снять реакцию. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        messageId: {
          type: 'number',
          description: 'id сообщения из tg_history/tg_search',
        },
        emoticon: {
          type: 'string',
          description:
            'Один эмодзи, например 👍; пустая строка — снять реакцию',
        },
      },
      required: ['chat', 'messageId'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      const messageId = needMessageId(args)
      const emoticon = String(args.emoticon ?? '')
      if (emoticon.length > 8)
        throw new Error('эмотикон — один эмодзи, не строка')
      return propose(
        'react',
        chat,
        `${emoticon || 'снять реакцию'} на сообщение ${messageId} в ${chat}`,
        'Реакция видна всем участникам чата.',
        ctx,
        undefined,
        undefined,
        { args: { chat, messageId, emoticon } }
      )
    },
  },

  {
    name: 'tg_vote',
    description:
      'Голосовать в опросе: options — индексы вариантов (0 и далее) из сообщения с опросом. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        messageId: {
          type: 'number',
          description: 'id сообщения с опросом (из tg_history/tg_search)',
        },
        options: {
          type: 'array',
          items: { type: 'number' },
          description: 'Индексы выбранных вариантов, например [0] или [0, 2]',
        },
      },
      required: ['chat', 'messageId', 'options'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      const messageId = needMessageId(args)
      const options = (Array.isArray(args.options) ? args.options : [])
        .map((x: unknown) => Number(x))
        .filter(Number.isFinite)
      if (!options.length)
        throw new Error(
          'назовите options: индексы вариантов опроса (0 и далее), хотя бы один'
        )
      return propose(
        'vote',
        chat,
        `варианты ${options.join(', ')} в опросе ${messageId} (${chat})`,
        'Голос виден автору опроса и участникам.',
        ctx,
        undefined,
        undefined,
        { args: { chat, messageId, options } }
      )
    },
  },

  {
    name: 'tg_archive',
    description:
      'Убрать диалог в архив. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Диалог: id или @username' },
      },
      required: ['chat'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      return propose(
        'archive',
        chat,
        `диалог ${chat}`,
        'Диалог уйдёт в архив и пропадёт из основного списка.',
        ctx,
        undefined,
        undefined,
        { args: { chat } }
      )
    },
  },

  {
    name: 'tg_unarchive',
    description:
      'Вернуть диалог из архива в основной список. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Диалог: id или @username' },
      },
      required: ['chat'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      return propose(
        'unarchive',
        chat,
        `диалог ${chat}`,
        'Диалог вернётся в основной список.',
        ctx,
        undefined,
        undefined,
        { args: { chat } }
      )
    },
  },

  {
    name: 'tg_mark_unread',
    description:
      'Пометить диалог непрочитанным. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Диалог: id или @username' },
      },
      required: ['chat'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      return propose(
        'mark_unread',
        chat,
        `диалог ${chat}`,
        'Диалог снова встанет в очередь непрочитанных.',
        ctx,
        undefined,
        undefined,
        { args: { chat } }
      )
    },
  },

  {
    name: 'tg_join',
    description:
      'Вступить в канал или группу по @username или ссылке-приглашению t.me. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: '@username канала или ссылка-приглашение t.me/+hash',
        },
      },
      required: ['channel'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const t = needString(
        args,
        'channel',
        'укажите channel: @username канала или ссылку-приглашение t.me'
      )
      // The executor splits invite links from usernames; a target that is
      // neither is refused here, as a tool error the model can fix.
      if (
        !/^@[\w]{3,64}$/.test(t) &&
        !/^https:\/\/t\.me\/(?:\+|joinchat\/)([\w-]{8,})/.test(t)
      )
        throw new Error(
          'нужен @username канала или ссылка-приглашение t.me (+hash или joinchat/hash)'
        )
      return propose(
        'join',
        t,
        t,
        'Вступление меняет подписки аккаунта и видно участникам.',
        ctx
      )
    },
  },

  {
    name: 'tg_leave',
    description:
      'Покинуть канал или чат. НЕОБРАТИМО: чат исчезнет из аккаунта вместе с историей. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Чат: id канала/группы или @username',
        },
      },
      required: ['chat'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id канала/группы или @username'
      )
      return propose(
        'leave',
        chat,
        chat,
        'Аккаунт покинет чат, и переписка в нём исчезнет из аккаунта; вернуться можно только по новой ссылке. Действие необратимо.',
        ctx,
        undefined,
        undefined,
        { args: { chat } }
      )
    },
  },

  {
    name: 'tg_kick',
    description:
      'Удалить участника из группы (нужны права администратора). НЕОБРАТИМО для этого чата. ' +
      'НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Группа: id или @username',
        },
        user: {
          type: 'string',
          description: 'Участник: id или @username',
        },
      },
      required: ['chat', 'user'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id группы или @username'
      )
      const user = needString(
        args,
        'user',
        'укажите user: id участника или @username'
      )
      return propose(
        'kick',
        chat,
        `участник ${user} из ${chat}`,
        'Удаление участника отменяется только новым приглашением, на которое он должен согласиться. Действие необратимо.',
        ctx,
        undefined,
        undefined,
        { args: { chat, user } }
      )
    },
  },

  {
    name: 'tg_delete_messages',
    description:
      'Удалить сообщения в чате: messageIds из tg_history или tg_search, до 100. ' +
      'НЕОБРАТИМО. НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        messageIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'id сообщений из tg_history/tg_search (до 100)',
        },
      },
      required: ['chat', 'messageIds'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      // The same ceiling the executor's check enforces: the model learns
      // the limit from the tool answer, not from a refused press.
      const ids = (Array.isArray(args.messageIds) ? args.messageIds : [])
        .map((x: unknown) => Number(x))
        .filter(n => Number.isFinite(n) && n > 0)
        .slice(0, 100)
      if (!ids.length)
        throw new Error(
          'назовите messageIds: id сообщений из tg_history/tg_search, хотя бы одно'
        )
      return propose(
        'delete',
        chat,
        `сообщения ${ids.join(', ')} из ${chat}`,
        'Удалённые сообщения не восстанавливаются ни у кого в этом чате. Действие необратимо.',
        ctx,
        undefined,
        undefined,
        { args: { chat, messageIds: ids } }
      )
    },
  },

  {
    name: 'tg_delete_chat',
    description:
      'Удалить чат из аккаунта: mode=clear — очистить историю и остаться, ' +
      'mode=leave — выйти. НЕОБРАТИМО. НЕ делает сразу — возвращает proposal на подтверждение.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'Чат: id диалога или @username' },
        mode: {
          type: 'string',
          description:
            'clear — очистить историю и остаться; leave — выйти (по умолчанию)',
        },
      },
      required: ['chat'],
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      const chat = needString(
        args,
        'chat',
        'укажите chat: id диалога или @username'
      )
      const mode = args.mode === 'clear' ? 'clear' : 'leave'
      return propose(
        'delete_chat',
        chat,
        mode === 'clear' ? `очистить историю ${chat}` : `удалить чат ${chat}`,
        mode === 'clear'
          ? 'История чата будет стёрта у аккаунта без копии. Действие необратимо.'
          : 'Чат будет удалён вместе с историей, аккаунт выйдет. Действие необратимо.',
        ctx,
        undefined,
        undefined,
        { args: { mode } }
      )
    },
  },
]
