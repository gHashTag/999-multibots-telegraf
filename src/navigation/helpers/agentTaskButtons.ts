import { MINI_APP_URL, canShowMiniAppButton } from '../config/miniApp.config'
import { разбитьДлинное as splitLongAnswer } from '@/helpers/telegramLongAnswer' // cyrillic-ok: existing helper

/** Only implemented screens belong here. A model never supplies a URL. */
export const AGENT_TASK_ROUTES = {
  chat: '/chat',
  script: '/generate/script',
  audio: '/generate/audio',
  image: '/generate/image',
  avatar: '/generate/avatar',
  video: '/generate/video',
  editor: '/generate/editor',
  profile: '/profile',
  plan: '/profile?tab=plan',
  files: '/profile?tab=files',
  skills: '/profile?tab=skills',
} as const

export type AgentTaskDestination = keyof typeof AGENT_TASK_ROUTES
export interface AgentTaskAction {
  type: 'open_mini_app'
  destination: AgentTaskDestination
}

const TASK_LABELS: Record<AgentTaskDestination, { en: string; ru: string }> = {
  chat: { en: 'Continue in app', ru: 'Продолжить в приложении' },
  script: { en: 'Open script', ru: 'Открыть сценарий' },
  audio: { en: 'Open audio', ru: 'Открыть аудио' },
  image: { en: 'Open images', ru: 'Открыть изображения' },
  avatar: { en: 'Open avatar', ru: 'Открыть аватар' },
  video: { en: 'Open video', ru: 'Открыть видео' },
  editor: { en: 'Open editor', ru: 'Открыть редактор' },
  profile: { en: 'Open profile', ru: 'Открыть профиль' },
  plan: { en: 'Open plan', ru: 'Открыть план' },
  files: { en: 'Open files', ru: 'Открыть файлы' },
  skills: { en: 'Open skills', ru: 'Открыть навыки' },
}

export function parseAgentTaskAction(value: unknown): AgentTaskAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const action = value as Record<string, unknown>
  if (
    action.type !== 'open_mini_app' ||
    typeof action.destination !== 'string' ||
    !Object.hasOwn(AGENT_TASK_ROUTES, action.destination) ||
    Object.keys(action).some(key => key !== 'type' && key !== 'destination')
  )
    return null
  return {
    type: 'open_mini_app',
    destination: action.destination as AgentTaskDestination,
  }
}

export function buildAgentTaskUrl(action: AgentTaskAction): string {
  const valid = parseAgentTaskAction(action)
  if (!valid) throw new Error('Unsupported Mini App task')
  return new URL(AGENT_TASK_ROUTES[valid.destination], MINI_APP_URL).toString()
}

interface TaskKeyboard {
  inline_keyboard: Array<Array<{ text: string; web_app: { url: string } }>>
}

function distinctActions(actions: readonly unknown[]): AgentTaskAction[] {
  const chosen: AgentTaskAction[] = []
  for (const candidate of actions) {
    const action = parseAgentTaskAction(candidate)
    if (
      action &&
      !chosen.some(item => item.destination === action.destination)
    ) {
      chosen.push(action)
      if (chosen.length === 2) break
    }
  }
  return chosen
}

export function createAgentTaskKeyboard(
  chatType: string | undefined,
  isRu: boolean,
  actions: readonly unknown[] = []
): TaskKeyboard | undefined {
  if (!canShowMiniAppButton(chatType)) return undefined
  const chosen = distinctActions(actions)
  if (!chosen.length)
    chosen.push({ type: 'open_mini_app', destination: 'chat' })
  return {
    inline_keyboard: chosen.map(action => [
      {
        text: TASK_LABELS[action.destination][isRu ? 'ru' : 'en'],
        web_app: { url: buildAgentTaskUrl(action) },
      },
    ]),
  }
}

interface TaskReplyContext {
  chat?: { type: string }
  reply: (
    text: string,
    extra?: { reply_markup: TaskKeyboard }
  ) => Promise<unknown>
}

/** One delivery path for text and file turns; only the final chunk has buttons. */
export async function replyWithAgentTaskButtons(
  ctx: TaskReplyContext,
  text: string,
  actions: readonly unknown[] = [],
  isRu = false
): Promise<boolean> {
  const chosen = distinctActions(actions)
  if (
    !text.trim() &&
    (!chosen.length || !canShowMiniAppButton(ctx.chat?.type))
  ) {
    return false
  }
  const answer =
    text.trim() ||
    (isRu
      ? 'Откройте нужный экран в приложении.'
      : 'Open the next screen in the app.')
  const chunks = splitLongAnswer(answer)
  const keyboard = createAgentTaskKeyboard(ctx.chat?.type, isRu, chosen)
  for (let index = 0; index < chunks.length; index++) {
    if (keyboard && index === chunks.length - 1) {
      await ctx.reply(chunks[index], { reply_markup: keyboard })
    } else {
      await ctx.reply(chunks[index])
    }
  }
  return true
}
